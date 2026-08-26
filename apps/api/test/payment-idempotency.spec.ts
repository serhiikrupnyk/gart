import request from 'supertest';

import { CALLBACK_MAX_AGE_MS } from '../src/payments/payment-provider';
import { PaymentsService } from '../src/payments/payments.service';
import {
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  subscribeTrainer,
  trainerIdFor,
  validRegistration,
} from './app-harness';

let harness: Harness;

beforeAll(async () => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
  harness = await createHarness();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await resetDatabase(harness.prisma);
  harness.payments.outcome = 'SUCCEEDED';
  harness.payments.unavailable = false;
  harness.queue.reset();
});

interface Charged {
  paymentId: string;
  providerRef: string;
  subscriptionId: string;
}

/** A trainer on a plan whose first renewal has been charged. */
async function charge(outcome: 'SUCCEEDED' | 'FAILED' | 'PENDING' = 'SUCCEEDED'): Promise<Charged> {
  await registerTrainer(harness);
  const trainerId = await trainerIdFor(harness, validRegistration.email);
  const subscription = await subscribeTrainer(harness, trainerId);

  harness.payments.outcome = outcome;
  await harness.app.get(PaymentsService).renewDue(subscription.nextChargeAt);

  const payment = await harness.prisma.payment.findFirstOrThrow();
  const issued = harness.payments.issuedFor(payment.id);

  if (issued === undefined) {
    throw new Error('The provider issued no charge');
  }

  return {
    paymentId: payment.id,
    providerRef: issued.providerRef,
    subscriptionId: subscription.id,
  };
}

function post(body: unknown): request.Test {
  return request(harness.app.getHttpServer())
    .post('/payments/callback/fake')
    .send(body as object);
}

const UAH = { amount: '500.00', currency: 'UAH' } as const;

describe('idempotency', () => {
  it('is a no-op when the very same delivery arrives twice', async () => {
    const { paymentId, providerRef } = await charge();

    const before = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(await harness.prisma.paymentEvent.count()).toBe(1);

    const delivered = await harness.prisma.paymentEvent.findFirstOrThrow();
    const replay = harness.payments.buildCallback(providerRef, 'SUCCEEDED', UAH, paymentId, {
      deliveryId: delivered.externalId,
    });

    await post(replay.body).expect(204);

    // Nothing moved: not the rows, not even the timestamp on the payment.
    expect(await harness.prisma.paymentEvent.count()).toBe(1);
    const after = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  });

  it('rejects a replayed delivery at the database even when forced', async () => {
    const { paymentId } = await charge();
    const event = await harness.prisma.paymentEvent.findFirstOrThrow();

    await expect(
      harness.prisma.paymentEvent.create({
        data: {
          paymentId,
          externalId: event.externalId,
          status: 'SUCCEEDED',
          rawStatus: 'success',
          payloadDigest: 'whatever',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('does not advance the subscription twice for one period', async () => {
    const { paymentId, providerRef, subscriptionId } = await charge();

    const after = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    // A second delivery with a FRESH id: the transition table refuses it,
    // because SUCCEEDED is not reachable from SUCCEEDED.
    const second = harness.payments.buildCallback(providerRef, 'SUCCEEDED', UAH, paymentId);
    await post(second.body).expect(204);

    const unchanged = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });
    expect(unchanged.currentPeriodEnd.toISOString()).toBe(after.currentPeriodEnd.toISOString());
    // Recorded even though it was refused: two deliveries arrived.
    expect(await harness.prisma.paymentEvent.count()).toBe(2);
  });
});

describe('status transitions', () => {
  it('does not let a late PENDING delivery walk a paid payment backwards', async () => {
    const { paymentId, providerRef } = await charge();

    const late = harness.payments.buildCallback(providerRef, 'PENDING', UAH, paymentId);
    await post(late.body).expect(204);

    const payment = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');
    expect(payment.paidAt).not.toBeNull();
  });

  it('lets a declined charge be retried on the same order and still succeed', async () => {
    const { paymentId, providerRef } = await charge('FAILED');

    const declined = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(declined.status).toBe('FAILED');

    const second = harness.payments.buildCallback(providerRef, 'SUCCEEDED', UAH, paymentId);
    await post(second.body).expect(204);

    const paid = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(paid.status).toBe('SUCCEEDED');
    // No row may claim both outcomes at once.
    expect(paid.failedAt).toBeNull();
  });

  it('ends a CANCELLED subscription too when the money goes back', async () => {
    const { paymentId, providerRef, subscriptionId } = await charge();

    // Cancelled-but-still-live is the normal state after a cancellation, and it
    // is exactly the access a refund takes back. Excluding it left a trainer
    // with their money AND their workspace.
    await harness.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'CANCELLED', nextChargeAt: null, cancelledAt: new Date() },
    });

    const refund = harness.payments.buildCallback(providerRef, 'REFUNDED', UAH, paymentId);
    await post(refund.body).expect(204);

    const after = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    expect(after.status).toBe('ENDED');
    expect(after.accessUntil.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('ends the subscription when the money goes back', async () => {
    const { paymentId, providerRef, subscriptionId } = await charge();

    const refund = harness.payments.buildCallback(providerRef, 'REFUNDED', UAH, paymentId);
    await post(refund.body).expect(204);

    const after = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    // Otherwise the trainer keeps a period they were refunded for, and is
    // charged again at the end of it.
    expect(after.status).toBe('ENDED');
    expect(after.nextChargeAt).toBeNull();
  });
});

describe('callback verification', () => {
  it('refuses a payload whose signature does not verify', async () => {
    const { paymentId, providerRef } = await charge();
    const callback = harness.payments.buildCallback(providerRef, 'SUCCEEDED', UAH, paymentId);

    await post({ ...(callback.body as object), signature: 'deadbeef' }).expect(400);

    expect(await harness.prisma.paymentEvent.count()).toBe(1);
  });

  it('refuses a payload whose data was altered after signing', async () => {
    const { paymentId, providerRef } = await charge();
    const callback = harness.payments.buildCallback(providerRef, 'SUCCEEDED', UAH, paymentId);
    const body = callback.body as { data: string; signature: string };

    const altered = Buffer.from(
      JSON.stringify({ order_id: paymentId, status: 'success', amount: '1.00' }),
      'utf8',
    ).toString('base64');

    await post({ data: altered, signature: body.signature }).expect(400);
  });

  it('does nothing when the provider reports an amount we never charged', async () => {
    const { paymentId, providerRef } = await charge('PENDING');

    const lying = harness.payments.buildCallback(providerRef, 'SUCCEEDED', UAH, paymentId, {
      amount: '1.00',
    });

    await post(lying.body).expect(204);

    expect(await harness.prisma.paymentEvent.count()).toBe(0);
    expect(
      (await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } })).status,
    ).toBe('PENDING');
  });

  it('refuses a delivery older than the freshness window', async () => {
    const { paymentId, providerRef } = await charge('PENDING');

    const stale = harness.payments.buildCallback(providerRef, 'SUCCEEDED', UAH, paymentId, {
      createdAt: new Date(Date.now() - CALLBACK_MAX_AGE_MS - 60_000),
    });

    await post(stale.body).expect(204);

    expect(await harness.prisma.paymentEvent.count()).toBe(0);
  });

  it('refuses a delivery dated implausibly far in the future', async () => {
    const { paymentId, providerRef } = await charge('PENDING');

    const ahead = harness.payments.buildCallback(providerRef, 'SUCCEEDED', UAH, paymentId, {
      createdAt: new Date(Date.now() + 10 * 60_000),
    });

    await post(ahead.body).expect(204);

    expect(await harness.prisma.paymentEvent.count()).toBe(0);
  });

  it('says nothing revealing about an order it has never heard of', async () => {
    const { providerRef } = await charge();

    const unknown = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      UAH,
      'ckunknownpaymentid0000000',
    );

    await post(unknown.body).expect(204);

    // Indistinguishable from a delivery that landed: nothing recorded that a
    // prober could detect by its absence or presence.
    expect(await harness.prisma.paymentEvent.count()).toBe(1);
  });

  it('refuses a callback addressed to a provider we do not run', async () => {
    const { paymentId, providerRef } = await charge();
    const callback = harness.payments.buildCallback(providerRef, 'SUCCEEDED', UAH, paymentId);

    await request(harness.app.getHttpServer())
      .post('/payments/callback/liqpay')
      .send(callback.body as object)
      .expect(400);
  });

  it('needs no session at all — an acquirer never has one', async () => {
    const { paymentId, providerRef } = await charge('PENDING');

    const callback = harness.payments.buildCallback(providerRef, 'SUCCEEDED', UAH, paymentId);

    // No Cookie header anywhere in this request, and it still lands.
    await post(callback.body).expect(204);

    expect(
      (await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } })).status,
    ).toBe('SUCCEEDED');
  });
});
