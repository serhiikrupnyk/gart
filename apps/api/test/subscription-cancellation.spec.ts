import request from 'supertest';

import { Prisma } from '../src/generated/prisma/client.js';
import { isAccessLive } from '../src/payments/access';
import { PaymentsService } from '../src/payments/payments.service';
import { SubscriptionsService } from '../src/payments/subscriptions.service';
import {
  createAcceptedClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
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
  harness.queue.reset();
});

interface Subscribed {
  cookie: string;
  clientCookie: string;
  clientId: string;
  subscriptionId: string;
}

async function subscribe(email = validRegistration.email, cookie?: string): Promise<Subscribed> {
  const trainerCookie = cookie ?? (await registerTrainer(harness));
  const { clientId, clientCookie } = await createAcceptedClient(harness, trainerCookie, {
    email: `client-${email}`,
  });
  const user = await harness.prisma.user.findFirstOrThrow({
    where: { email },
    include: { trainer: true },
  });

  const product = await harness.prisma.product.create({
    data: {
      trainerId: user.trainer?.id ?? '',
      name: 'Місячний супровід',
      kind: 'SUBSCRIPTION',
      period: 'MONTHLY',
      priceAmount: new Prisma.Decimal('900.00'),
      currency: 'UAH',
    },
  });

  await request(harness.app.getHttpServer())
    .post(`/clients/${clientId}/payments`)
    .set('Cookie', trainerCookie)
    .send({ productId: product.id })
    .expect(201);

  const subscription = await harness.prisma.subscription.findFirstOrThrow({
    where: { clientId },
  });

  return { cookie: trainerCookie, clientCookie, clientId, subscriptionId: subscription.id };
}

describe('the client cancelling their own subscription', () => {
  it('stops future charges and keeps access to the end of what they paid for', async () => {
    const { clientCookie, subscriptionId } = await subscribe();
    const before = await harness.prisma.subscription.findFirstOrThrow();

    const response = await request(harness.app.getHttpServer())
      .post(`/me/subscriptions/${subscriptionId}/cancel`)
      .set('Cookie', clientCookie)
      .expect(201);

    expect(response.body.status).toBe('CANCELLED');
    // Cancelling is not refunding: the paid period runs its course.
    expect(response.body.accessUntil).toBe(before.accessUntil.toISOString());
    expect(response.body.isActive).toBe(true);
    expect(response.body.nextChargeAt).toBeNull();

    const stored = await harness.prisma.subscription.findFirstOrThrow();
    expect(stored.cancelledBy).toBe('CLIENT');
    expect(stored.cancelledAt).not.toBeNull();
  });

  it('is never charged again by the job', async () => {
    const { clientCookie, subscriptionId } = await subscribe();
    const due = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt ?? new Date();

    await request(harness.app.getHttpServer())
      .post(`/me/subscriptions/${subscriptionId}/cancel`)
      .set('Cookie', clientCookie)
      .expect(201);

    // Well past when it would have renewed.
    expect(
      await harness.app.get(PaymentsService).renewDue(new Date(due.getTime() + 40 * 86400000)),
    ).toBe(0);
    expect(await harness.prisma.payment.count()).toBe(1);
  });

  it('can be resumed while the paid period is still running', async () => {
    const { clientCookie, subscriptionId } = await subscribe();
    const paidUntil = (await harness.prisma.subscription.findFirstOrThrow()).accessUntil;

    await request(harness.app.getHttpServer())
      .post(`/me/subscriptions/${subscriptionId}/cancel`)
      .set('Cookie', clientCookie)
      .expect(201);

    const resumed = await request(harness.app.getHttpServer())
      .post(`/me/subscriptions/${subscriptionId}/reactivate`)
      .set('Cookie', clientCookie)
      .expect(201);

    expect(resumed.body.status).toBe('ACTIVE');
    // The next charge is when the paid period runs out — which is what access
    // was already going to do.
    expect(resumed.body.nextChargeAt).toBe(paidUntil.toISOString());
    expect(resumed.body.canReactivate).toBe(false);
  });

  it('cannot be resumed once it has actually lapsed', async () => {
    const { clientCookie, subscriptionId } = await subscribe();

    await request(harness.app.getHttpServer())
      .post(`/me/subscriptions/${subscriptionId}/cancel`)
      .set('Cookie', clientCookie)
      .expect(201);

    // The period runs out.
    await harness.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { accessUntil: new Date(Date.now() - 1000) },
    });

    // Starting again is a purchase, not a toggle.
    await request(harness.app.getHttpServer())
      .post(`/me/subscriptions/${subscriptionId}/reactivate`)
      .set('Cookie', clientCookie)
      .expect(400);
  });

  it('cannot be cancelled twice', async () => {
    const { clientCookie, subscriptionId } = await subscribe();

    await request(harness.app.getHttpServer())
      .post(`/me/subscriptions/${subscriptionId}/cancel`)
      .set('Cookie', clientCookie)
      .expect(201);

    await request(harness.app.getHttpServer())
      .post(`/me/subscriptions/${subscriptionId}/cancel`)
      .set('Cookie', clientCookie)
      .expect(400);
  });
});

describe('the trainer cancelling', () => {
  it('records that it was the trainer, not the client', async () => {
    const { cookie, subscriptionId } = await subscribe();

    const response = await request(harness.app.getHttpServer())
      .post(`/subscriptions/${subscriptionId}/cancel`)
      .set('Cookie', cookie)
      .expect(201);

    expect(response.body.status).toBe('CANCELLED');
    expect(response.body.cancelledBy).toBe('TRAINER');
  });
});

describe('tenant isolation', () => {
  it("refuses a client cancelling someone else's subscription, and says only 404", async () => {
    const first = await subscribe();

    const otherTrainer = await registerTrainer(harness, secondRegistration);
    const second = await subscribe(secondRegistration.email, otherTrainer);

    const server = harness.app.getHttpServer();

    const trespass = await request(server)
      .post(`/me/subscriptions/${second.subscriptionId}/cancel`)
      .set('Cookie', first.clientCookie)
      .expect(404);

    const absent = await request(server)
      .post('/me/subscriptions/ckdoesnotexist000000000/cancel')
      .set('Cookie', first.clientCookie)
      .expect(404);

    expect(trespass.body).toEqual(absent.body);

    // And it really is untouched.
    expect(
      (await harness.prisma.subscription.findFirstOrThrow({ where: { id: second.subscriptionId } }))
        .status,
    ).toBe('ACTIVE');
  });

  it("refuses a trainer touching another trainer's subscription", async () => {
    const first = await subscribe();
    const otherTrainer = await registerTrainer(harness, secondRegistration);

    const server = harness.app.getHttpServer();
    await request(server)
      .post(`/subscriptions/${first.subscriptionId}/cancel`)
      .set('Cookie', otherTrainer)
      .expect(404);
    await request(server)
      .post(`/subscriptions/${first.subscriptionId}/reactivate`)
      .set('Cookie', otherTrainer)
      .expect(404);

    const list = await request(server)
      .get('/subscriptions')
      .set('Cookie', otherTrainer)
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it('shows a client only their own, and never a commission', async () => {
    const { clientCookie } = await subscribe();

    const response = await request(harness.app.getHttpServer())
      .get('/me/subscriptions')
      .set('Cookie', clientCookie)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain('platformFee');
    expect(JSON.stringify(response.body)).not.toContain('payout');
    // The fee on ₴900 at 5%.
    expect(JSON.stringify(response.body)).not.toContain('45.00');
  });

  it('is closed to the wrong kind of session entirely', async () => {
    const { cookie, clientCookie } = await subscribe();
    const server = harness.app.getHttpServer();

    await request(server).get('/subscriptions').set('Cookie', clientCookie).expect(401);
    await request(server).get('/me/subscriptions').set('Cookie', cookie).expect(401);
    await request(server).get('/subscriptions').expect(401);
  });
});

describe('the two authorities on access', () => {
  it('never contradict each other for the period that was paid for', async () => {
    await subscribe();

    const subscription = await harness.prisma.subscription.findFirstOrThrow();
    const entitlement = await harness.prisma.entitlement.findFirstOrThrow();

    // The subscription's access and the entitlement that paid for it describe
    // the SAME window, to the millisecond.
    expect(subscription.accessUntil.toISOString()).toBe(entitlement.endsAt?.toISOString());
    expect(subscription.currentPeriodStart.toISOString()).toBe(entitlement.startsAt.toISOString());

    // And the PRODUCTION path agrees with the ledger at every boundary — the
    // service's own isLive, not a window rebuilt here, because reconstructing
    // it would be exactly the drift this is meant to catch.
    const subscriptions = harness.app.get(SubscriptionsService);

    for (const [label, at] of [
      ['just after it starts', new Date(subscription.currentPeriodStart.getTime() + 1000)],
      ['a second before it ends', new Date(subscription.accessUntil.getTime() - 1000)],
      ['exactly at the end', subscription.accessUntil],
      ['a second after', new Date(subscription.accessUntil.getTime() + 1000)],
      ['before it starts', new Date(subscription.currentPeriodStart.getTime() - 1000)],
    ] as [string, Date][]) {
      expect([label, subscriptions.isLive(subscription, at)]).toEqual([
        label,
        isAccessLive(entitlement, at),
      ]);
    }
  });

  it('differ only by the grace that was not paid for, and say so', async () => {
    const { subscriptionId } = await subscribe();
    const periodEnd = (await harness.prisma.subscription.findFirstOrThrow()).currentPeriodEnd;

    harness.payments.outcome = 'FAILED';
    await harness.app.get(PaymentsService).renewDue(periodEnd);

    const subscription = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });
    const entitlement = await harness.prisma.entitlement.findFirstOrThrow();

    // Access now outlives the entitlement — deliberately, and only by grace.
    expect(subscription.accessUntil.getTime()).toBeGreaterThan(entitlement.endsAt?.getTime() ?? 0);

    // The ledger is untouched: no payment ever covered those days, and the
    // entitlement does not pretend one did.
    expect(entitlement.endsAt?.toISOString()).toBe(periodEnd.toISOString());
    expect(entitlement.revokedAt).toBeNull();
  });
});
