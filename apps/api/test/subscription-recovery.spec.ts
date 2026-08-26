import { DUNNING_MAX_ATTEMPTS, planPrice, type PublicPayment } from '@gart/shared';
import request from 'supertest';

import { amountsEqual } from '../src/common/money';
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

/**
 * The ways a subscription can be walked into a state that takes money without
 * granting access, grants access without taking money, or stops charging while
 * still granting.
 *
 * Every case here was found by adversarial review rather than by a failing
 * test, which is why each one asserts the MONEY and the ACCESS together: a
 * charge and the period it bought are the same fact, and a test that checks one
 * of them can pass while the other is wrong.
 */
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

const server = () => harness.app.getHttpServer();

async function onPlan(period: 'MONTHLY' | 'ANNUAL' = 'MONTHLY') {
  const cookie = await registerTrainer(harness);
  const trainerId = await trainerIdFor(harness, validRegistration.email);
  const subscription = await subscribeTrainer(harness, trainerId, { period });

  return { cookie, trainerId, ...subscription };
}

describe('resuming a subscription mid-dunning', () => {
  it('does NOT rewind the ladder — cancel-and-resume cannot buy free time for ever', async () => {
    const { cookie, currentPeriodEnd } = await onPlan();
    const payments = harness.app.get(PaymentsService);

    // A first charge declines: PAST_DUE, grace granted, one attempt spent.
    harness.payments.outcome = 'FAILED';
    await payments.renewDue(new Date(currentPeriodEnd.getTime() + 1000));

    const failed = await harness.prisma.subscription.findFirstOrThrow();
    expect(failed.status).toBe('PAST_DUE');
    expect(failed.failedAttempts).toBe(1);
    const graceAfterFirst = failed.accessUntil;

    // The trainer cancels and immediately resumes — two clicks, both offered.
    await request(server()).post('/billing/subscription/cancel').set('Cookie', cookie).expect(201);
    await request(server())
      .post('/billing/subscription/reactivate')
      .set('Cookie', cookie)
      .expect(201);

    const resumed = await harness.prisma.subscription.findFirstOrThrow();
    // Rewinding this to 0 re-issued attempt 1, whose Payment row already
    // existed: the insert collided, the charge was skipped as a duplicate, and
    // `claim` re-granted six days of grace. Repeating the two clicks then
    // bought free service indefinitely, with no charge ever attempted again.
    expect(resumed.failedAttempts).toBe(1);

    // The next run really does charge, and really does move the ladder on.
    await payments.renewDue(new Date((resumed.nextChargeAt?.getTime() ?? 0) + 1000));

    const after = await harness.prisma.subscription.findFirstOrThrow();
    expect(after.failedAttempts).toBe(2);
    expect(await harness.prisma.payment.count()).toBe(2);
    // And grace was not re-granted: access still runs out when it always did.
    expect(after.accessUntil.getTime()).toBe(graceAfterFirst.getTime());
  });

  it('still ends the subscription once the attempts are genuinely spent', async () => {
    const { currentPeriodEnd } = await onPlan();
    const payments = harness.app.get(PaymentsService);
    harness.payments.outcome = 'FAILED';

    let at = new Date(currentPeriodEnd.getTime() + 1000);

    for (let attempt = 1; attempt <= DUNNING_MAX_ATTEMPTS; attempt += 1) {
      await payments.renewDue(at);
      const row = await harness.prisma.subscription.findFirstOrThrow();
      at = new Date((row.nextChargeAt ?? row.accessUntil).getTime() + 1000);
    }

    const ended = await harness.prisma.subscription.findFirstOrThrow();
    expect(ended.status).toBe('ENDED');
    expect(await harness.prisma.payment.count()).toBe(DUNNING_MAX_ATTEMPTS);
  });
});

describe('an abandoned checkout', () => {
  it('does not change the terms of an arrangement nobody paid for', async () => {
    const { cookie, currentPeriodEnd } = await onPlan('MONTHLY');

    // Cancel, then open an ANNUAL checkout and walk away from it.
    await request(server()).post('/billing/subscription/cancel').set('Cookie', cookie).expect(201);

    const past = new Date(Date.now() - 1000);
    await harness.prisma.subscription.updateMany({ data: { accessUntil: past } });
    harness.payments.outcome = 'PENDING';

    await request(server())
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'PRO', period: 'ANNUAL' })
      .expect(201);

    // The live row is untouched: writing the intent here meant the next
    // renewal charged twelve months' money for a checkout nobody completed.
    const row = await harness.prisma.subscription.findFirstOrThrow();
    expect(row.period).toBe('MONTHLY');
    expect(row.currentPeriodEnd.getTime()).toBe(currentPeriodEnd.getTime());
  });

  it('cannot revive a cancelled subscription when it settles late', async () => {
    const { cookie } = await onPlan();
    harness.payments.outcome = 'PENDING';

    // A checkout opened while lapsed...
    const past = new Date(Date.now() - 1000);
    await harness.prisma.subscription.updateMany({
      data: { status: 'ENDED', accessUntil: past, nextChargeAt: null },
    });
    await request(server())
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'PRO', period: 'MONTHLY' })
      .expect(201);

    // ...but the trainer subscribed again by another route and then cancelled,
    // and only now does the stale tab report back.
    const future = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await harness.prisma.subscription.updateMany({
      data: {
        status: 'CANCELLED',
        currentPeriodStart: new Date(Date.now() - 1000),
        currentPeriodEnd: future,
        accessUntil: future,
        nextChargeAt: null,
        cancelledAt: new Date(),
      },
    });

    const payment = await harness.prisma.payment.findFirstOrThrow();
    const issued = harness.payments.issuedFor(payment.id);
    await harness.app
      .get(PaymentsService)
      .applyCallback(
        harness.payments.buildCallback(
          issued?.providerRef ?? '',
          'SUCCEEDED',
          { amount: payment.amount.toFixed(2), currency: 'UAH' },
          payment.id,
          { recurrenceRef: issued?.recurrenceRef ?? undefined },
        ),
      );

    const after = await harness.prisma.subscription.findFirstOrThrow();
    // «Stop charging me» is the one thing cancelling has to guarantee.
    expect(after.status).toBe('CANCELLED');
    expect(after.nextChargeAt).toBeNull();
  });
});

describe('a cadence change landing mid-run', () => {
  it('grants the period the charge was priced for, not the one the row now names', async () => {
    const { cookie, currentPeriodEnd } = await onPlan('MONTHLY');
    const payments = harness.app.get(PaymentsService);

    // The charge is raised and priced MONTHLY, but answers by webhook.
    harness.payments.outcome = 'PENDING';
    await payments.renewDue(new Date(currentPeriodEnd.getTime() + 1000));

    const payment = await harness.prisma.payment.findFirstOrThrow();
    expect(amountsEqual(payment.amount, planPrice('PRO', 'MONTHLY').amount)).toBe(true);

    // ...and in that window the trainer asks for annual billing.
    await harness.prisma.subscription.updateMany({ data: { status: 'ACTIVE' } });
    await request(server())
      .post('/billing/subscription/period')
      .set('Cookie', cookie)
      .send({ period: 'ANNUAL' })
      .expect(201);

    const issued = harness.payments.issuedFor(payment.id);
    await payments.applyCallback(
      harness.payments.buildCallback(
        issued?.providerRef ?? '',
        'SUCCEEDED',
        { amount: payment.amount.toFixed(2), currency: 'UAH' },
        payment.id,
      ),
    );

    const after = await harness.prisma.subscription.findFirstOrThrow();
    // One month's money must buy one month. Re-deriving the cadence from the
    // live row at settlement bought twelve.
    expect(after.period).toBe('MONTHLY');
    expect(after.currentPeriodEnd.getTime()).toBe(
      new Date(Date.UTC(2026, 9, 1, 12, 0, 0)).getTime(),
    );
    // The change is still pending, and lands on the next renewal.
    expect(after.pendingPeriod).toBe('ANNUAL');
  });
});

describe('a refund', () => {
  it('takes back only the period it actually refunded', async () => {
    const { currentPeriodEnd } = await onPlan();
    const payments = harness.app.get(PaymentsService);

    // Renew once, so there is an old period and a current one.
    await payments.renewDue(new Date(currentPeriodEnd.getTime() + 1000));
    const current = await harness.prisma.subscription.findFirstOrThrow();
    expect(current.status).toBe('ACTIVE');

    // Now refund the FIRST charge — a routine support action months later.
    const old = await harness.prisma.payment.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
    const issued = harness.payments.issuedFor(old.id);

    await harness.prisma.payment.update({
      where: { id: old.id },
      data: { status: 'SUCCEEDED', periodStart: new Date('2026-07-01T12:00:00.000Z') },
    });

    await payments.applyCallback(
      harness.payments.buildCallback(
        issued?.providerRef ?? `fake_${old.id}`,
        'REFUNDED',
        { amount: old.amount.toFixed(2), currency: 'UAH' },
        old.id,
      ),
    );

    const after = await harness.prisma.subscription.findFirstOrThrow();
    // Access is paid for and must not be revoked over money returned for a
    // period that is already over.
    expect(after.status).toBe('ACTIVE');
    expect(after.accessUntil.getTime()).toBe(current.accessUntil.getTime());
  });

  it('does end the arrangement when the CURRENT period is refunded', async () => {
    const { currentPeriodEnd } = await onPlan();
    const payments = harness.app.get(PaymentsService);

    await payments.renewDue(new Date(currentPeriodEnd.getTime() + 1000));
    const current = await harness.prisma.subscription.findFirstOrThrow();

    const paid = await harness.prisma.payment.findFirstOrThrow({
      where: { periodStart: current.currentPeriodStart },
    });
    const issued = harness.payments.issuedFor(paid.id);

    await payments.applyCallback(
      harness.payments.buildCallback(
        issued?.providerRef ?? '',
        'REFUNDED',
        { amount: paid.amount.toFixed(2), currency: 'UAH' },
        paid.id,
      ),
    );

    const after = await harness.prisma.subscription.findFirstOrThrow();
    expect(after.status).toBe('ENDED');
  });
});

describe('a charge whose answer never came back', () => {
  it('is never charged a second time for the same period', async () => {
    const { currentPeriodEnd } = await onPlan();
    const payments = harness.app.get(PaymentsService);

    // Attempt one: the acquirer takes the order and promises a webhook that
    // never comes — indistinguishable, from here, from a capture we never
    // heard about.
    harness.payments.outcome = 'PENDING';
    await payments.renewDue(new Date(currentPeriodEnd.getTime() + 1000));

    const raised = await harness.prisma.payment.findFirstOrThrow();
    expect(raised.status).toBe('PENDING');
    expect(raised.providerRef).not.toBeNull();

    // The ladder comes round again while that outcome is still unknown.
    const row = await harness.prisma.subscription.findFirstOrThrow();
    harness.payments.outcome = 'SUCCEEDED';
    await payments.renewDue(new Date((row.nextChargeAt?.getTime() ?? 0) + 1000));

    // One period, one charge. Charging the second rung would have taken the
    // money twice if the first had in fact been captured, with no refund path
    // anywhere in this system.
    expect(await harness.prisma.payment.count()).toBe(1);
  });

  it('still runs the full ladder for charges that genuinely declined', async () => {
    const { currentPeriodEnd } = await onPlan();
    const payments = harness.app.get(PaymentsService);

    // A DECLINE is resolved, not unknown, so it must not block the next rung —
    // the guard above would otherwise silently cancel the dunning policy.
    harness.payments.outcome = 'FAILED';

    let at = new Date(currentPeriodEnd.getTime() + 1000);

    for (let attempt = 1; attempt <= DUNNING_MAX_ATTEMPTS; attempt += 1) {
      await payments.renewDue(at);
      const row = await harness.prisma.subscription.findFirstOrThrow();
      at = new Date((row.nextChargeAt ?? row.accessUntil).getTime() + 1000);
    }

    expect(await harness.prisma.payment.count()).toBe(DUNNING_MAX_ATTEMPTS);
    expect((await harness.prisma.subscription.findFirstOrThrow()).status).toBe('ENDED');
  });

  it('leaves no payment stuck reading «в обробці» when the charge throws', async () => {
    const { cookie, currentPeriodEnd } = await onPlan();
    const payments = harness.app.get(PaymentsService);

    harness.payments.unavailable = true;
    await payments.renewDue(new Date(currentPeriodEnd.getTime() + 1000));

    const history = await request(server())
      .get('/billing/payments')
      .set('Cookie', cookie)
      .expect(200);

    const charges = history.body as PublicPayment[];
    expect(charges).toHaveLength(1);
    expect(charges[0]?.status).toBe('FAILED');
  });
});
