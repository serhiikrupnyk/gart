import request from 'supertest';

import { Prisma } from '../src/generated/prisma/client.js';
import { CALLBACK_MAX_AGE_MS } from '../src/payments/payment-provider';
import {
  createAcceptedClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  validRegistration,
} from './app-harness';

let harness: Harness;

beforeAll(async () => {
  // Each test here registers a trainer, and the credential budget is 10/min.
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
});

interface Paid {
  paymentId: string;
  clientId: string;
  providerRef: string;
}

/** Runs a full checkout and returns what a callback would need to name it. */
async function checkout(price = '1500.00'): Promise<Paid> {
  const cookie = await registerTrainer(harness);
  const { clientId } = await createAcceptedClient(harness, cookie);
  const user = await harness.prisma.user.findFirstOrThrow({
    where: { email: validRegistration.email },
    include: { trainer: true },
  });

  const product = await harness.prisma.product.create({
    data: {
      trainerId: user.trainer?.id ?? '',
      name: 'Місячний супровід',
      kind: 'ONE_TIME',
      priceAmount: new Prisma.Decimal(price),
      currency: 'UAH',
      accessDays: 30,
    },
  });

  const response = await request(harness.app.getHttpServer())
    .post(`/clients/${clientId}/payments`)
    .set('Cookie', cookie)
    .send({ productId: product.id })
    .expect(201);

  const paymentId: string = response.body.payment.id;
  const issued = harness.payments.issuedFor(paymentId);

  if (issued === undefined) {
    throw new Error('The provider issued no checkout');
  }

  return { paymentId, clientId, providerRef: issued.providerRef };
}

function post(body: unknown): request.Test {
  return request(harness.app.getHttpServer())
    .post('/payments/callback/fake')
    .send(body as object);
}

describe('idempotency', () => {
  it('is a no-op when the very same delivery arrives twice', async () => {
    const { paymentId, providerRef } = await checkout();

    const before = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(await harness.prisma.entitlement.count()).toBe(1);
    expect(await harness.prisma.paymentEvent.count()).toBe(1);

    // The same delivery id the inline settlement already used.
    const delivered = await harness.prisma.paymentEvent.findFirstOrThrow();
    const replay = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
      { deliveryId: delivered.externalId },
    );

    await post(replay.body).expect(204);

    // Nothing moved: not the rows, not even the timestamp on the payment.
    expect(await harness.prisma.entitlement.count()).toBe(1);
    expect(await harness.prisma.paymentEvent.count()).toBe(1);

    const after = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  });

  it('grants only once when a second delivery carries a DIFFERENT id', async () => {
    const { paymentId, providerRef } = await checkout();

    expect(await harness.prisma.entitlement.count()).toBe(1);

    // A fresh delivery id slips past the PaymentEvent constraint on purpose.
    // What stops this one is the transition table — SUCCEEDED is not reachable
    // from SUCCEEDED — so the entitlement insert is never attempted. The
    // Entitlement constraint is the guard for the case this test CANNOT reach:
    // two deliveries racing each other, proven directly against the database in
    // the test below.
    const second = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );

    await post(second.body).expect(204);

    expect(await harness.prisma.entitlement.count()).toBe(1);
    // Recorded even though it was refused: two deliveries arrived.
    expect(await harness.prisma.paymentEvent.count()).toBe(2);
  });

  it('proves the guard is the database, not the service', async () => {
    const { paymentId } = await checkout();
    const existing = await harness.prisma.entitlement.findFirstOrThrow();

    // Inserting a second entitlement for the same payment must be impossible
    // even with the service bypassed entirely.
    await expect(
      harness.prisma.entitlement.create({
        data: {
          trainerId: existing.trainerId,
          clientId: existing.clientId,
          productId: existing.productId,
          paymentId,
          startsAt: new Date(),
          endsAt: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a replayed delivery at the database even when forced', async () => {
    const { paymentId } = await checkout();
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
});

describe('status transitions', () => {
  it('takes access back when the money goes back', async () => {
    const { paymentId, providerRef } = await checkout();

    expect(await harness.prisma.entitlement.count()).toBe(1);

    const refund = harness.payments.buildCallback(
      providerRef,
      'REFUNDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );

    await post(refund.body).expect(204);

    const payment = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('REFUNDED');

    // The row survives for audit; what changes is that it no longer grants.
    const granted = await harness.prisma.entitlement.findFirstOrThrow();
    expect(granted.revokedAt).not.toBeNull();
  });

  it('stops reporting a refunded entitlement as active to the client', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId, clientCookie } = await createAcceptedClient(harness, cookie);
    const user = await harness.prisma.user.findFirstOrThrow({
      where: { email: validRegistration.email },
      include: { trainer: true },
    });
    const product = await harness.prisma.product.create({
      data: {
        trainerId: user.trainer?.id ?? '',
        name: 'Місячний супровід',
        kind: 'ONE_TIME',
        priceAmount: new Prisma.Decimal('1500.00'),
        currency: 'UAH',
        accessDays: 30,
      },
    });

    const created = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId: product.id })
      .expect(201);

    const before = await request(harness.app.getHttpServer())
      .get('/me/entitlements')
      .set('Cookie', clientCookie)
      .expect(200);
    expect(before.body[0].isActive).toBe(true);

    const paymentId: string = created.body.payment.id;
    const issued = harness.payments.issuedFor(paymentId);
    const refund = harness.payments.buildCallback(
      issued?.providerRef ?? '',
      'REFUNDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );

    await post(refund.body).expect(204);

    const after = await request(harness.app.getHttpServer())
      .get('/me/entitlements')
      .set('Cookie', clientCookie)
      .expect(200);

    expect(after.body[0].isActive).toBe(false);
  });

  it('does not let a late PENDING delivery walk a paid payment backwards', async () => {
    const { paymentId, providerRef } = await checkout();

    // Acquirers emit `processing` before `success` and do not promise order.
    // A retry of the earlier one arriving second must not undo the later one.
    const late = harness.payments.buildCallback(
      providerRef,
      'PENDING',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );

    await post(late.body).expect(204);

    const payment = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');
    expect(payment.paidAt).not.toBeNull();
    expect(await harness.prisma.entitlement.count()).toBe(1);

    // It was still recorded: refusing to act on a delivery is not the same as
    // pretending it never arrived.
    expect(await harness.prisma.paymentEvent.count()).toBe(2);
  });

  it('does not let a late FAILED delivery contradict a payment that succeeded', async () => {
    const { paymentId, providerRef } = await checkout();

    const late = harness.payments.buildCallback(
      providerRef,
      'FAILED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );

    await post(late.body).expect(204);

    const payment = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');
    expect(payment.failedAt).toBeNull();

    const granted = await harness.prisma.entitlement.findFirstOrThrow();
    expect(granted.revokedAt).toBeNull();
  });

  it('lets a declined card be retried on the same order and still grant access', async () => {
    harness.payments.outcome = 'FAILED';
    const { paymentId, providerRef } = await checkout();

    const declined = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(declined.status).toBe('FAILED');
    expect(declined.failedAt).not.toBeNull();

    // The order reference we hand the acquirer IS this payment's id, so a payer
    // who reaches for a second card on the same hosted page produces a success
    // for the SAME order. Treating FAILED as terminal would take their money
    // and grant nothing.
    const second = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );

    await post(second.body).expect(204);

    const paid = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(paid.status).toBe('SUCCEEDED');
    expect(paid.paidAt).not.toBeNull();
    // No row may claim both outcomes at once.
    expect(paid.failedAt).toBeNull();
    expect(await harness.prisma.entitlement.count()).toBe(1);
  });

  it('refuses a success that arrives after the money was already returned', async () => {
    const { paymentId, providerRef } = await checkout();

    const refund = harness.payments.buildCallback(
      providerRef,
      'REFUNDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );
    await post(refund.body).expect(204);

    const late = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );
    await post(late.body).expect(204);

    const payment = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('REFUNDED');

    const granted = await harness.prisma.entitlement.findFirstOrThrow();
    expect(granted.revokedAt).not.toBeNull();
  });

  it('records a refund that overtakes the success delivery it followed', async () => {
    const { paymentId, providerRef } = await checkout();
    // The success was lost in transit: put the row back where it would be.
    await harness.prisma.entitlement.deleteMany();
    await harness.prisma.paymentEvent.deleteMany();
    await harness.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'PENDING', paidAt: null },
    });

    const refund = harness.payments.buildCallback(
      providerRef,
      'REFUNDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );
    await post(refund.body).expect(204);

    expect(
      (await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } })).status,
    ).toBe('REFUNDED');

    // And the redelivered success must not then grant access to returned money.
    const success = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );
    await post(success.body).expect(204);

    expect(await harness.prisma.entitlement.count()).toBe(0);
  });

  it('grants access from OUR clock, not from a provider running ahead', async () => {
    const { paymentId, providerRef } = await checkout();
    await harness.prisma.entitlement.deleteMany();
    await harness.prisma.paymentEvent.deleteMany();
    await harness.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'PENDING', paidAt: null },
    });

    const ahead = new Date(Date.now() + 45_000);
    const callback = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
      { createdAt: ahead },
    );

    await post(callback.body).expect(204);

    const granted = await harness.prisma.entitlement.findFirstOrThrow();

    // A future startsAt would report isActive:false to a client who has paid.
    expect(granted.startsAt.getTime()).toBeLessThanOrEqual(Date.now());

    // The provider's own timestamp is still kept, where it belongs.
    const payment = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(payment.paidAt?.getTime()).toBe(ahead.getTime());
  });
});

describe('deliveries without their own identifier', () => {
  it('falls back to a payload digest, so a byte-identical retry still collides', async () => {
    const { paymentId, providerRef } = await checkout();
    await harness.prisma.entitlement.deleteMany();
    await harness.prisma.paymentEvent.deleteMany();
    await harness.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'PENDING', paidAt: null },
    });

    // What an adapter for a provider that sends no per-delivery id returns.
    const fixed = new Date();
    const build = (): unknown =>
      harness.payments.buildCallback(
        providerRef,
        'SUCCEEDED',
        { amount: '1500.00', currency: 'UAH' },
        paymentId,
        { deliveryId: '', createdAt: fixed },
      ).body;

    await post(build()).expect(204);

    const recorded = await harness.prisma.paymentEvent.findFirstOrThrow();
    expect(recorded.externalId).not.toBe('');
    expect(recorded.externalId).toBe(recorded.payloadDigest);

    // The identical payload again: one event, one grant, nothing doubled.
    await post(build()).expect(204);

    expect(await harness.prisma.paymentEvent.count()).toBe(1);
    expect(await harness.prisma.entitlement.count()).toBe(1);
  });
});

describe('a provider that cannot open a checkout', () => {
  it('leaves no payment stuck pending forever', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const user = await harness.prisma.user.findFirstOrThrow({
      where: { email: validRegistration.email },
      include: { trainer: true },
    });
    const product = await harness.prisma.product.create({
      data: {
        trainerId: user.trainer?.id ?? '',
        name: 'Місячний супровід',
        kind: 'ONE_TIME',
        priceAmount: new Prisma.Decimal('1500.00'),
        currency: 'UAH',
        accessDays: 30,
      },
    });

    harness.payments.unavailable = true;

    await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId: product.id })
      .expect(500);

    harness.payments.unavailable = false;

    // A PENDING row with no provider reference is one nothing could ever
    // resolve: there is no checkout to ask about and none to call back.
    const payment = await harness.prisma.payment.findFirstOrThrow();
    expect(payment.status).toBe('FAILED');
    expect(payment.providerRef).toBeNull();
    expect(await harness.prisma.entitlement.count()).toBe(0);
  });
});

describe('callback verification', () => {
  it('refuses a payload whose signature does not verify', async () => {
    const { paymentId, providerRef } = await checkout();
    const callback = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );

    const tampered = { ...(callback.body as object), signature: 'deadbeef' };

    await post(tampered).expect(400);

    expect(await harness.prisma.paymentEvent.count()).toBe(1);
  });

  it('refuses a payload whose data was altered after signing', async () => {
    const { paymentId, providerRef } = await checkout();
    const callback = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );

    const body = callback.body as { data: string; signature: string };
    const altered = Buffer.from(
      JSON.stringify({ order_id: paymentId, status: 'success', amount: '1.00' }),
      'utf8',
    ).toString('base64');

    await post({ data: altered, signature: body.signature }).expect(400);
  });

  it('grants nothing when the provider reports an amount we never charged', async () => {
    const { paymentId, providerRef } = await checkout('1500.00');
    await harness.prisma.entitlement.deleteMany();
    await harness.prisma.paymentEvent.deleteMany();

    // Correctly signed, and still a lie about the money.
    const lying = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
      { amount: '1.00' },
    );

    await post(lying.body).expect(204);

    expect(await harness.prisma.entitlement.count()).toBe(0);
    expect(await harness.prisma.paymentEvent.count()).toBe(0);
  });

  it('refuses a delivery older than the freshness window', async () => {
    const { paymentId, providerRef } = await checkout();
    await harness.prisma.entitlement.deleteMany();
    await harness.prisma.paymentEvent.deleteMany();

    const stale = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
      { createdAt: new Date(Date.now() - CALLBACK_MAX_AGE_MS - 60_000) },
    );

    await post(stale.body).expect(204);

    expect(await harness.prisma.paymentEvent.count()).toBe(0);
    expect(await harness.prisma.entitlement.count()).toBe(0);
  });

  it('refuses a delivery dated implausibly far in the future', async () => {
    const { paymentId, providerRef } = await checkout();
    await harness.prisma.entitlement.deleteMany();
    await harness.prisma.paymentEvent.deleteMany();

    const ahead = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
      { createdAt: new Date(Date.now() + 10 * 60_000) },
    );

    await post(ahead.body).expect(204);

    expect(await harness.prisma.paymentEvent.count()).toBe(0);
  });

  it('says nothing revealing about an order it has never heard of', async () => {
    const { providerRef } = await checkout();

    const unknown = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      'ckunknownpaymentid0000000',
    );

    await post(unknown.body).expect(204);

    // Indistinguishable from a delivery that landed: same status, and nothing
    // recorded that a prober could detect by its absence or presence.
    expect(await harness.prisma.paymentEvent.count()).toBe(1);
  });

  it('refuses a callback addressed to a provider we do not run', async () => {
    const { paymentId, providerRef } = await checkout();

    const callback = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );

    await request(harness.app.getHttpServer())
      .post('/payments/callback/liqpay')
      .send(callback.body as object)
      .expect(400);
  });

  it('needs no session at all — an acquirer never has one', async () => {
    const { paymentId, providerRef } = await checkout();
    await harness.prisma.entitlement.deleteMany();
    await harness.prisma.paymentEvent.deleteMany();
    // Back to the state a webhook actually finds: the inline settlement already
    // moved this payment on, and SUCCEEDED is not a status it can reach twice.
    await harness.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'PENDING', paidAt: null },
    });

    const callback = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );

    // No Cookie header anywhere in this request, and it still lands.
    await post(callback.body).expect(204);

    expect(await harness.prisma.entitlement.count()).toBe(1);
  });
});
