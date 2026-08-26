import request from 'supertest';

import { isAccessLive } from '../src/payments/access';
import { PaymentsService } from '../src/payments/payments.service';
import { SubscriptionsService } from '../src/payments/subscriptions.service';
import {
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
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
  harness.queue.reset();
});

async function onPlan(
  email = validRegistration.email,
  cookie?: string,
): Promise<{ cookie: string; subscriptionId: string; due: Date }> {
  const trainerCookie = cookie ?? (await registerTrainer(harness));
  const trainerId = await trainerIdFor(harness, email);
  const subscription = await subscribeTrainer(harness, trainerId);

  return { cookie: trainerCookie, subscriptionId: subscription.id, due: subscription.nextChargeAt };
}

describe('a trainer cancelling their own subscription', () => {
  it('stops future charges and keeps access to the end of what they paid for', async () => {
    const { cookie } = await onPlan();
    const before = await harness.prisma.subscription.findFirstOrThrow();

    const response = await request(harness.app.getHttpServer())
      .post('/billing/subscription/cancel')
      .set('Cookie', cookie)
      .expect(201);

    expect(response.body.status).toBe('CANCELLED');
    // Cancelling is not refunding: the paid period runs its course.
    expect(response.body.accessUntil).toBe(before.accessUntil.toISOString());
    expect(response.body.isActive).toBe(true);
    expect(response.body.nextChargeAt).toBeNull();
    expect((await harness.prisma.subscription.findFirstOrThrow()).cancelledAt).not.toBeNull();
  });

  it('is never charged again by the job', async () => {
    const { cookie, due } = await onPlan();

    await request(harness.app.getHttpServer())
      .post('/billing/subscription/cancel')
      .set('Cookie', cookie)
      .expect(201);

    // Well past when it would have renewed.
    expect(
      await harness.app.get(PaymentsService).renewDue(new Date(due.getTime() + 40 * 86400000)),
    ).toBe(0);
    expect(await harness.prisma.payment.count()).toBe(0);
  });

  it('can be resumed while the paid period is still running', async () => {
    const { cookie } = await onPlan();
    const paidUntil = (await harness.prisma.subscription.findFirstOrThrow()).accessUntil;

    await request(harness.app.getHttpServer())
      .post('/billing/subscription/cancel')
      .set('Cookie', cookie)
      .expect(201);

    const resumed = await request(harness.app.getHttpServer())
      .post('/billing/subscription/reactivate')
      .set('Cookie', cookie)
      .expect(201);

    expect(resumed.body.status).toBe('ACTIVE');
    expect(resumed.body.canReactivate).toBe(false);

    // An hour BEFORE access runs out, not at the instant it does — the same
    // lead every other charge gets. Scheduling it at the boundary would lock a
    // paid-up trainer out for up to an hour every period, but only ever for one
    // who had used the cancel/resume toggle.
    expect(new Date(String(resumed.body.nextChargeAt)).getTime()).toBe(
      paidUntil.getTime() - 60 * 60 * 1000,
    );

    // And a clean ladder: resuming mid-dunning must not re-enter at attempt two.
    expect((await harness.prisma.subscription.findFirstOrThrow()).failedAttempts).toBe(0);
  });

  it('cannot be resumed once it has actually lapsed', async () => {
    const { cookie, subscriptionId } = await onPlan();

    await request(harness.app.getHttpServer())
      .post('/billing/subscription/cancel')
      .set('Cookie', cookie)
      .expect(201);

    await harness.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { accessUntil: new Date(Date.now() - 1000) },
    });

    // Starting again is a purchase, not a toggle.
    await request(harness.app.getHttpServer())
      .post('/billing/subscription/reactivate')
      .set('Cookie', cookie)
      .expect(400);
  });

  it('cannot be cancelled twice', async () => {
    const { cookie } = await onPlan();

    await request(harness.app.getHttpServer())
      .post('/billing/subscription/cancel')
      .set('Cookie', cookie)
      .expect(201);
    await request(harness.app.getHttpServer())
      .post('/billing/subscription/cancel')
      .set('Cookie', cookie)
      .expect(400);
  });
});

describe('tenant isolation', () => {
  it('shows a trainer only their own subscription', async () => {
    const first = await onPlan();

    const secondCookie = await registerTrainer(harness, secondRegistration);
    await onPlan(secondRegistration.email, secondCookie);

    const mine = await request(harness.app.getHttpServer())
      .get('/billing/subscription')
      .set('Cookie', first.cookie)
      .expect(200);

    expect(mine.body.id).toBe(first.subscriptionId);

    // Cancelling reaches only their own — there is no id to supply.
    await request(harness.app.getHttpServer())
      .post('/billing/subscription/cancel')
      .set('Cookie', first.cookie)
      .expect(201);

    expect(
      (await harness.prisma.subscription.findFirstOrThrow({ where: { id: first.subscriptionId } }))
        .status,
    ).toBe('CANCELLED');
    // The other trainer's is untouched.
    expect(
      (
        await harness.prisma.subscription.findFirstOrThrow({
          where: { NOT: { id: first.subscriptionId } },
        })
      ).status,
    ).toBe('ACTIVE');
  });

  it('answers 404 for a trainer who has never subscribed', async () => {
    const cookie = await registerTrainer(harness);

    const none = await request(harness.app.getHttpServer())
      .get('/billing/subscription')
      .set('Cookie', cookie)
      .expect(200);
    expect(none.body).toEqual({});

    await request(harness.app.getHttpServer())
      .post('/billing/subscription/cancel')
      .set('Cookie', cookie)
      .expect(404);
  });

  it('is closed to a client session and to no session at all', async () => {
    const { cookie } = await onPlan();
    const { clientCookie } = await import('./app-harness').then(async (m) =>
      m.createAcceptedClient(harness, cookie),
    );

    const server = harness.app.getHttpServer();
    await request(server).get('/billing/subscription').set('Cookie', clientCookie).expect(401);
    await request(server)
      .post('/billing/subscription/cancel')
      .set('Cookie', clientCookie)
      .expect(401);
    await request(server).get('/billing/subscription').expect(401);
    await request(server).get('/billing/payments').set('Cookie', clientCookie).expect(401);
  });
});

describe('access', () => {
  it('answers through the one shared rule, at every boundary', async () => {
    await onPlan();

    const subscription = await harness.prisma.subscription.findFirstOrThrow();
    const subscriptions = harness.app.get(SubscriptionsService);

    for (const [label, at, expected] of [
      ['just after it starts', new Date(subscription.currentPeriodStart.getTime() + 1000), true],
      ['a second before it ends', new Date(subscription.accessUntil.getTime() - 1000), true],
      ['exactly at the end', subscription.accessUntil, false],
      ['a second after', new Date(subscription.accessUntil.getTime() + 1000), false],
      ['before it starts', new Date(subscription.currentPeriodStart.getTime() - 1000), false],
    ] as [string, Date, boolean][]) {
      expect([label, subscriptions.isLive(subscription, at)]).toEqual([label, expected]);

      // And the service is not writing the comparison out for itself.
      expect(subscriptions.isLive(subscription, at)).toBe(
        isAccessLive(
          {
            startsAt: subscription.currentPeriodStart,
            endsAt: subscription.accessUntil,
            revokedAt: null,
          },
          at,
        ),
      );
    }
  });
});
