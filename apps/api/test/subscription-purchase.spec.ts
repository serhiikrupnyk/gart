import {
  PLAN_CAPABILITIES,
  planPrice,
  SUBSCRIPTION_PLANS,
  TRIAL_DAYS,
  type PublicPayment,
  type PublicSubscription,
} from '@gart/shared';
import request from 'supertest';

import { amountsEqual } from '../src/common/money';
import { PaymentsService } from '../src/payments/payments.service';
import { isSubscriptionLive } from '../src/payments/access';
import {
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
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
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Registers, then walks the real checkout to the end. */
async function buy(
  period: 'MONTHLY' | 'ANNUAL' = 'MONTHLY',
): Promise<{ cookie: string; redirectUrl: string }> {
  const cookie = await registerTrainer(harness);

  const response = await request(harness.app.getHttpServer())
    .post('/billing/subscription/checkout')
    .set('Cookie', cookie)
    .send({ plan: 'PRO', period })
    .expect(201);

  return { cookie, redirectUrl: (response.body as { redirectUrl: string }).redirectUrl };
}

describe('the trial', () => {
  it('starts at registration: fourteen days, no plan chosen, no charge scheduled', async () => {
    const before = Date.now();
    const cookie = await registerTrainer(harness);

    const response = await request(harness.app.getHttpServer())
      .get('/billing/subscription')
      .set('Cookie', cookie)
      .expect(200);

    const trial = response.body as PublicSubscription;

    expect(trial.status).toBe('TRIALING');
    expect(trial.isActive).toBe(true);
    // THE point of a no-card trial: nothing can charge it, because nothing is
    // scheduled and no mandate exists for anything to charge against.
    expect(trial.nextChargeAt).toBeNull();

    const row = await harness.prisma.subscription.findFirstOrThrow();
    expect(row.recurrenceRef).toBeNull();

    const days = (new Date(trial.accessUntil).getTime() - before) / DAY_MS;
    expect(days).toBeGreaterThan(TRIAL_DAYS - 0.01);
    expect(days).toBeLessThan(TRIAL_DAYS + 0.01);
  });

  it('is live on its last day and dead once it runs out', async () => {
    await registerTrainer(harness);
    const row = await harness.prisma.subscription.findFirstOrThrow();

    const dayThirteen = new Date(row.currentPeriodStart.getTime() + 13 * DAY_MS);
    const dayFifteen = new Date(row.currentPeriodStart.getTime() + 15 * DAY_MS);

    expect(isSubscriptionLive(row, dayThirteen)).toBe(true);
    expect(isSubscriptionLive(row, dayFifteen)).toBe(false);
    // The boundary itself, which is the instant a trial actually ends.
    expect(isSubscriptionLive(row, row.accessUntil)).toBe(false);
    expect(isSubscriptionLive(row, new Date(row.accessUntil.getTime() - 1))).toBe(true);
  });

  it('charges NOTHING when it runs out — the renewal job never sees it', async () => {
    await registerTrainer(harness);
    const payments = harness.app.get(PaymentsService);

    // Long after the trial is over.
    await payments.renewDue(new Date(Date.now() + 90 * DAY_MS));

    expect(await harness.prisma.payment.count()).toBe(0);

    const row = await harness.prisma.subscription.findFirstOrThrow();
    expect(row.status).toBe('TRIALING');
    expect(row.failedAttempts).toBe(0);
  });
});

describe('opening a subscription', () => {
  it('sends the trainer to the acquirer and grants nothing before it settles', async () => {
    const cookie = await registerTrainer(harness);
    // A hosted page that has not been paid yet.
    harness.payments.outcome = 'PENDING';

    const response = await request(harness.app.getHttpServer())
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'PRO', period: 'MONTHLY' })
      .expect(201);

    expect((response.body as { redirectUrl: string }).redirectUrl).toMatch(/^https:\/\//);

    // Still trialing: closing the acquirer's tab leaves the trainer where they were.
    const row = await harness.prisma.subscription.findFirstOrThrow();
    expect(row.status).toBe('TRIALING');
    expect(row.recurrenceRef).toBeNull();

    const payment = await harness.prisma.payment.findFirstOrThrow();
    expect(payment.status).toBe('PENDING');
  });

  it('activates on settlement with the right period, anchor and charge lead', async () => {
    const { cookie } = await buy('MONTHLY');

    const response = await request(harness.app.getHttpServer())
      .get('/billing/subscription')
      .set('Cookie', cookie)
      .expect(200);

    const active = response.body as PublicSubscription;
    expect(active.status).toBe('ACTIVE');
    expect(active.plan).toBe('PRO');
    expect(active.price).toEqual(planPrice('PRO', 'MONTHLY'));

    const row = await harness.prisma.subscription.findFirstOrThrow();

    // The anniversary is the day they PAID, not the day they signed up for a trial.
    expect(row.anchorDay).toBe(row.currentPeriodStart.getUTCDate());
    // Access runs exactly to the period end...
    expect(row.accessUntil.getTime()).toBe(row.currentPeriodEnd.getTime());
    // ...and the renewal is attempted an hour BEFORE it, so a paid-up trainer
    // is never locked out while their own renewal is still being taken.
    expect(row.currentPeriodEnd.getTime() - (row.nextChargeAt?.getTime() ?? 0)).toBe(
      60 * 60 * 1000,
    );
  });

  it('stores the mandate the callback establishes, and renews against it', async () => {
    const { cookie } = await buy('MONTHLY');

    const row = await harness.prisma.subscription.findFirstOrThrow();
    // The mandate arrives with the CALLBACK, which is where every Ukrainian
    // acquirer puts it — not with the redirect, where no card has been typed yet.
    expect(row.recurrenceRef).toMatch(/^fake_mandate_/);

    const firstPeriodEnd = row.currentPeriodEnd;
    const payments = harness.app.get(PaymentsService);

    // The whole point of establishing a mandate: the unattended job can charge it.
    expect(await payments.renewDue(new Date(firstPeriodEnd.getTime() + 1000))).toBe(1);

    const renewed = await harness.prisma.subscription.findFirstOrThrow();
    expect(renewed.status).toBe('ACTIVE');
    expect(renewed.currentPeriodStart.getTime()).toBe(firstPeriodEnd.getTime());
    expect(renewed.currentPeriodEnd.getTime()).toBeGreaterThan(firstPeriodEnd.getTime());

    const history = await request(harness.app.getHttpServer())
      .get('/billing/payments')
      .set('Cookie', cookie)
      .expect(200);

    const charges = history.body as PublicPayment[];
    expect(charges).toHaveLength(2);
    expect(charges.every((charge) => charge.status === 'SUCCEEDED')).toBe(true);
  });

  it('settles through the one callback path, recording the delivery like any other', async () => {
    await buy('MONTHLY');

    // If the checkout had its own settle path, no PaymentEvent would exist —
    // that row is written only by applyCallback.
    const events = await harness.prisma.paymentEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe('SUCCEEDED');
  });

  it('derives the price itself, and refuses a caller that tries to name one', async () => {
    const cookie = await registerTrainer(harness);
    const server = harness.app.getHttpServer();

    // A price is not an input. The validation pipe refuses the unknown field
    // outright rather than quietly ignoring it, which is the stronger answer:
    // a caller that thought it was setting a price is told it was not.
    await request(server)
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'PRO', period: 'ANNUAL', amount: '1.00' })
      .expect(400);

    expect(await harness.prisma.payment.count()).toBe(0);

    await request(server)
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'PRO', period: 'ANNUAL' })
      .expect(201);

    const payment = await harness.prisma.payment.findFirstOrThrow();
    expect(amountsEqual(payment.amount, planPrice('PRO', 'ANNUAL').amount)).toBe(true);
  });

  it('leaves no active subscription when the payment fails', async () => {
    const cookie = await registerTrainer(harness);
    harness.payments.outcome = 'FAILED';

    await request(harness.app.getHttpServer())
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'PRO', period: 'MONTHLY' })
      .expect(201);

    const row = await harness.prisma.subscription.findFirstOrThrow();
    expect(row.status).toBe('TRIALING');
    expect(row.recurrenceRef).toBeNull();
    // A mistyped card is not attempt one of a dunning ladder: there is no
    // mandate yet and nothing is scheduled, so nothing may be counted against it.
    expect(row.failedAttempts).toBe(0);
    expect(await harness.prisma.notification.count()).toBe(0);
  });

  it('refuses a plan that is not on sale, and says so', async () => {
    const cookie = await registerTrainer(harness);

    // GROW became sellable in Step 29, when nutrition shipped behind it. SCALE
    // is still defined by a bigger team and an extended agenda, neither built,
    // so the registry keeps refusing it — read from PLAN_CAPABILITIES rather
    // than hard-coded, so this test follows the product decision instead of
    // having to be remembered alongside it.
    const unsellable = SUBSCRIPTION_PLANS.filter((plan) => !PLAN_CAPABILITIES[plan].sellable);
    expect(unsellable).toEqual(['SCALE']);

    for (const plan of unsellable) {
      const refused = await request(harness.app.getHttpServer())
        .post('/billing/subscription/checkout')
        .set('Cookie', cookie)
        .send({ plan, period: 'MONTHLY' })
        .expect(400);

      expect((refused.body as { message: string }).message).toContain('недоступний');
    }

    expect(await harness.prisma.payment.count()).toBe(0);
  });

  it('refuses to sell a second subscription to somebody who already has one', async () => {
    const { cookie } = await buy('MONTHLY');

    await request(harness.app.getHttpServer())
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'PRO', period: 'ANNUAL' })
      .expect(400);

    // One charge, not two: changing cadence must never be reachable by paying
    // again on top of a period already paid for.
    expect(await harness.prisma.payment.count()).toBe(1);
  });

  it('sends a cancelled-but-still-running trainer to reactivate, not to pay again', async () => {
    const { cookie } = await buy('MONTHLY');
    const server = harness.app.getHttpServer();

    await request(server).post('/billing/subscription/cancel').set('Cookie', cookie).expect(201);

    // Paying again would start a fresh period from today and quietly forfeit
    // the days already paid for. The trainer must not lose money by pressing
    // the more obvious of two buttons.
    const refused = await request(server)
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'PRO', period: 'MONTHLY' })
      .expect(400);
    expect((refused.body as { message: string }).message).toContain('відновіть');
    expect(await harness.prisma.payment.count()).toBe(1);

    // The lossless route works and keeps the period they had.
    const before = await harness.prisma.subscription.findFirstOrThrow();
    await request(server)
      .post('/billing/subscription/reactivate')
      .set('Cookie', cookie)
      .expect(201);

    const after = await harness.prisma.subscription.findFirstOrThrow();
    expect(after.status).toBe('ACTIVE');
    expect(after.accessUntil.getTime()).toBe(before.accessUntil.getTime());
  });

  it('lets a trainer buy again once a cancelled subscription has actually run out', async () => {
    const { cookie } = await buy('MONTHLY');
    const server = harness.app.getHttpServer();

    await request(server).post('/billing/subscription/cancel').set('Cookie', cookie).expect(201);

    const past = new Date(Date.now() - 1000);
    await harness.prisma.subscription.updateMany({ data: { accessUntil: past } });

    await request(server)
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'PRO', period: 'MONTHLY' })
      .expect(201);

    const reopened = await harness.prisma.subscription.findFirstOrThrow();
    // The old «stop charging me» must not survive a deliberate new purchase,
    // or the money would be taken with nothing scheduled after it.
    expect(reopened.status).toBe('ACTIVE');
    expect(reopened.cancelledAt).toBeNull();
    expect(reopened.nextChargeAt).not.toBeNull();
  });

  it('is closed to a client session and to no session at all', async () => {
    const server = harness.app.getHttpServer();

    await request(server)
      .post('/billing/subscription/checkout')
      .send({ plan: 'PRO', period: 'MONTHLY' })
      .expect(401);
    await request(server)
      .post('/billing/subscription/period')
      .send({ period: 'ANNUAL' })
      .expect(401);
  });
});

describe('changing the billing cadence', () => {
  it('takes effect at the next renewal and charges nothing now', async () => {
    const { cookie } = await buy('MONTHLY');
    const before = await harness.prisma.subscription.findFirstOrThrow();

    const changed = await request(harness.app.getHttpServer())
      .post('/billing/subscription/period')
      .set('Cookie', cookie)
      .send({ period: 'ANNUAL' })
      .expect(201);

    const body = changed.body as PublicSubscription;
    expect(body.pendingPeriod).toBe('ANNUAL');
    // The period already paid for is untouched, in every respect.
    expect(body.period).toBe('MONTHLY');
    expect(body.currentPeriodEnd).toBe(before.currentPeriodEnd.toISOString());
    expect(body.price).toEqual(planPrice('PRO', 'MONTHLY'));
    // No proration, no top-up, no refund: nothing moved.
    expect(await harness.prisma.payment.count()).toBe(1);

    const payments = harness.app.get(PaymentsService);
    expect(await payments.renewDue(new Date(before.currentPeriodEnd.getTime() + 1000))).toBe(1);

    const renewed = await harness.prisma.subscription.findFirstOrThrow();
    expect(renewed.period).toBe('ANNUAL');
    expect(renewed.pendingPeriod).toBeNull();

    // And the renewal charged the NEW cadence, not the old one.
    const latest = await harness.prisma.payment.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
    });
    expect(amountsEqual(latest.amount, planPrice('PRO', 'ANNUAL').amount)).toBe(true);
  });

  it('lets a trainer take the change back before it lands', async () => {
    const { cookie } = await buy('MONTHLY');
    const server = harness.app.getHttpServer();

    await request(server)
      .post('/billing/subscription/period')
      .set('Cookie', cookie)
      .send({ period: 'ANNUAL' })
      .expect(201);

    const reverted = await request(server)
      .post('/billing/subscription/period')
      .set('Cookie', cookie)
      .send({ period: 'MONTHLY' })
      .expect(201);

    expect((reverted.body as PublicSubscription).pendingPeriod).toBeNull();
  });

  it('is refused while there is no active subscription to change', async () => {
    const cookie = await registerTrainer(harness);

    await request(harness.app.getHttpServer())
      .post('/billing/subscription/period')
      .set('Cookie', cookie)
      .send({ period: 'ANNUAL' })
      .expect(400);
  });
});

describe('the subscription surface', () => {
  it('answers only for the trainer who owns it', async () => {
    const { cookie } = await buy('MONTHLY');
    const mine = await trainerIdFor(harness, validRegistration.email);

    const response = await request(harness.app.getHttpServer())
      .get('/billing/subscription')
      .set('Cookie', cookie)
      .expect(200);

    const row = await harness.prisma.subscription.findFirstOrThrow();
    expect(row.trainerId).toBe(mine);
    expect((response.body as PublicSubscription).id).toBe(row.id);
  });

  it('reports the client allowance so a screen never promises what the API refuses', async () => {
    const cookie = await registerTrainer(harness);

    const trial = await request(harness.app.getHttpServer())
      .get('/billing/subscription')
      .set('Cookie', cookie)
      .expect(200);

    expect((trial.body as PublicSubscription).maxClients).toBe(3);
    expect((trial.body as PublicSubscription).clientCount).toBe(0);

    await request(harness.app.getHttpServer())
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'PRO', period: 'MONTHLY' })
      .expect(201);

    const paid = await request(harness.app.getHttpServer())
      .get('/billing/subscription')
      .set('Cookie', cookie)
      .expect(200);

    // «Безлім клієнтів» is what the plan promises, so it is what it reports.
    expect((paid.body as PublicSubscription).maxClients).toBeNull();
  });
});
