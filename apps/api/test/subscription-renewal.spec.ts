import { DUNNING_GRACE_DAYS, DUNNING_MAX_ATTEMPTS, DUNNING_RETRY_DAYS } from '@gart/shared';

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

const DAY = 24 * 60 * 60 * 1000;

function renew(now: Date): Promise<number> {
  return harness.app.get(PaymentsService).renewDue(now);
}

/** A registered trainer already on a plan, as a completed purchase would leave them. */
async function onPlan(
  overrides: Parameters<typeof subscribeTrainer>[2] = {},
): Promise<{ cookie: string; subscriptionId: string; due: Date; periodEnd: Date }> {
  const cookie = await registerTrainer(harness);
  const trainerId = await trainerIdFor(harness, validRegistration.email);
  const subscription = await subscribeTrainer(harness, trainerId, overrides);

  return {
    cookie,
    subscriptionId: subscription.id,
    due: subscription.nextChargeAt,
    periodEnd: subscription.currentPeriodEnd,
  };
}

describe('renewing', () => {
  it('charges exactly once when due, and advances the period', async () => {
    const { subscriptionId, due, periodEnd } = await onPlan();

    expect(await renew(due)).toBe(1);

    const after = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    expect(after.status).toBe('ACTIVE');
    expect(after.currentPeriodStart.toISOString()).toBe(periodEnd.toISOString());
    expect(after.currentPeriodEnd.getTime()).toBeGreaterThan(periodEnd.getTime());
    // The ledger grew; it did not change.
    expect(await harness.prisma.payment.count()).toBe(1);
  });

  it("charges the plan price, and the plan price is the server's to decide", async () => {
    await onPlan({ plan: 'GROW', period: 'QUARTERLY' });
    const due = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt ?? new Date();

    await renew(due);

    // GROW is ₴900 a month; a quarter is three of them.
    const payment = await harness.prisma.payment.findFirstOrThrow();
    expect(payment.amount.toFixed(2)).toBe('2700.00');
    expect(payment.periodSnapshot).toBe('QUARTERLY');
  });

  it('is a NO-OP when the job runs again for the same attempt', async () => {
    const { subscriptionId, due, periodEnd } = await onPlan();

    await renew(due);
    const afterFirst = await harness.prisma.subscription.findFirstOrThrow();

    // Put it back where a re-run of the same tick would find it.
    await harness.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { nextChargeAt: due, currentPeriodEnd: periodEnd, failedAttempts: 0 },
    });

    expect(await renew(due)).toBe(0);

    // The DATABASE refused the second charge, not a check in the service.
    expect(await harness.prisma.payment.count()).toBe(1);
    expect(afterFirst.currentPeriodEnd.getTime()).toBeGreaterThan(periodEnd.getTime());
  });

  it('refuses a duplicate ATTEMPT at the database even with the service bypassed', async () => {
    const { subscriptionId, due } = await onPlan();
    await renew(due);

    const payment = await harness.prisma.payment.findFirstOrThrow();

    await expect(
      harness.prisma.payment.create({
        data: {
          trainerId: payment.trainerId,
          subscriptionId,
          periodStart: payment.periodStart,
          periodAttempt: payment.periodAttempt,
          amount: payment.amount,
          currency: payment.currency,
          provider: 'fake',
          description: 'duplicate attempt',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('does not charge before it is due', async () => {
    const { due } = await onPlan();

    expect(await renew(new Date(due.getTime() - 1))).toBe(0);
    expect(await harness.prisma.payment.count()).toBe(0);

    expect(await renew(due)).toBe(1);
  });

  it('starts the new period where the last one ended, not when the callback landed', async () => {
    const { subscriptionId, periodEnd } = await onPlan();

    // The job runs two hours late.
    await renew(new Date(periodEnd.getTime() + 2 * 60 * 60 * 1000));

    // Otherwise the anniversary would drift two hours later every period.
    expect(
      (
        await harness.prisma.subscription.findFirstOrThrow({ where: { id: subscriptionId } })
      ).currentPeriodStart.toISOString(),
    ).toBe(periodEnd.toISOString());
  });

  it('attempts the charge before access would lapse, not at the boundary', async () => {
    const { due, periodEnd } = await onPlan();

    // Access is end-exclusive and the job runs hourly, so charging exactly at
    // the boundary would leave a paid-up trainer locked out for up to an hour.
    expect(due.getTime()).toBe(periodEnd.getTime() - 60 * 60 * 1000);
  });
});

describe('when a charge never reports back', () => {
  it('still advances the schedule when the provider answers only by webhook', async () => {
    const { subscriptionId, due } = await onPlan();

    harness.payments.outcome = 'PENDING';
    await renew(due);

    const claimed = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    // The attempt was CLAIMED before the money was touched, so the answer never
    // coming costs one attempt, not the subscription.
    expect(claimed.failedAttempts).toBe(1);
    expect(claimed.nextChargeAt?.getTime()).toBeGreaterThan(due.getTime());
    expect(claimed.accessUntil.getTime()).toBeGreaterThan(claimed.currentPeriodEnd.getTime());
  });

  it('is not wedged by a provider that throws', async () => {
    const { subscriptionId, due } = await onPlan();

    harness.payments.unavailable = true;
    await renew(due);
    harness.payments.unavailable = false;

    const after = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    expect(after.failedAttempts).toBe(1);
    expect(after.status).toBe('PAST_DUE');

    // And the next attempt genuinely goes through.
    expect(await renew(after.nextChargeAt ?? new Date())).toBe(1);
    expect((await harness.prisma.subscription.findFirstOrThrow()).status).toBe('ACTIVE');
  });

  it('closes a subscription whose claimed attempts all went unanswered', async () => {
    const { subscriptionId } = await onPlan();
    harness.payments.outcome = 'PENDING';

    for (let i = 0; i < DUNNING_MAX_ATTEMPTS; i += 1) {
      const at = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt;

      if (at === null) break;

      await renew(at);
    }

    const spent = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });
    expect(spent.failedAttempts).toBe(DUNNING_MAX_ATTEMPTS);
    expect(spent.nextChargeAt).toBeNull();

    // The safety net, rather than leaving it PAST_DUE for ever.
    await renew(new Date(spent.accessUntil.getTime() + 1000));
    expect((await harness.prisma.subscription.findFirstOrThrow()).status).toBe('ENDED');
  });

  it('stops charging a subscription with no mandate', async () => {
    const { subscriptionId, due } = await onPlan({ recurrenceRef: null });

    expect(await renew(due)).toBe(0);

    const after = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });
    expect(after.status).toBe('CANCELLED');
    expect(after.nextChargeAt).toBeNull();
    expect(await harness.prisma.payment.count()).toBe(0);
  });
});

describe('the dunning schedule', () => {
  it('keeps access alive on the first failure, and grants exactly the grace window', async () => {
    const { due, periodEnd } = await onPlan();

    harness.payments.outcome = 'FAILED';
    await renew(due);

    const after = await harness.prisma.subscription.findFirstOrThrow();

    expect(after.status).toBe('PAST_DUE');
    expect(after.failedAttempts).toBe(1);
    expect(after.accessUntil.getTime()).toBe(periodEnd.getTime() + DUNNING_GRACE_DAYS * DAY);
    expect(after.nextChargeAt?.getTime()).toBe(periodEnd.getTime() + DUNNING_RETRY_DAYS[0]! * DAY);
  });

  it('retries on exactly the days the policy names, and lapses only on the last', async () => {
    const { due, periodEnd } = await onPlan();

    harness.payments.outcome = 'FAILED';
    await renew(due);

    for (const [index, day] of DUNNING_RETRY_DAYS.entries()) {
      const at = new Date(periodEnd.getTime() + day * DAY);
      const state = await harness.prisma.subscription.findFirstOrThrow();

      expect(state.nextChargeAt?.getTime()).toBe(at.getTime());
      // Access holds through every retry.
      expect(state.accessUntil.getTime()).toBeGreaterThan(at.getTime() - 1);

      await renew(at);
      expect((await harness.prisma.subscription.findFirstOrThrow()).failedAttempts).toBe(index + 2);
    }

    const ended = await harness.prisma.subscription.findFirstOrThrow();

    expect(ended.failedAttempts).toBe(DUNNING_MAX_ATTEMPTS);
    expect(ended.status).toBe('ENDED');
    expect(ended.nextChargeAt).toBeNull();
  });

  it('grants grace once, not once per attempt', async () => {
    const { due, periodEnd } = await onPlan();

    harness.payments.outcome = 'FAILED';
    await renew(due);
    const afterFirst = (await harness.prisma.subscription.findFirstOrThrow()).accessUntil;

    await renew(new Date(periodEnd.getTime() + DUNNING_RETRY_DAYS[0]! * DAY));

    // Otherwise every retry would buy another window and it would never end.
    expect((await harness.prisma.subscription.findFirstOrThrow()).accessUntil.toISOString()).toBe(
      afterFirst.toISOString(),
    );
  });

  it('speaks to the trainer twice and no more: on the first failure and on the last', async () => {
    const { due, periodEnd } = await onPlan();

    harness.payments.outcome = 'FAILED';
    await renew(due);

    const afterFirst = await harness.prisma.notification.findMany();

    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]?.type).toBe('SUBSCRIPTION_PAST_DUE');
    expect(afterFirst[0]?.audience).toBe('TRAINER');
    // No client is involved in the trainer's own bill.
    expect(afterFirst[0]?.clientId).toBeNull();
    expect(afterFirst[0]?.body).toContain('Доступ триває до');

    // The middle retries say nothing — a message per attempt is nagging.
    await renew(new Date(periodEnd.getTime() + DUNNING_RETRY_DAYS[0]! * DAY));
    expect(await harness.prisma.notification.count()).toBe(1);

    await renew(new Date(periodEnd.getTime() + DUNNING_RETRY_DAYS[1]! * DAY));
    expect(await harness.prisma.notification.count()).toBe(1);

    // The last one does.
    await renew(new Date(periodEnd.getTime() + DUNNING_RETRY_DAYS[2]! * DAY));

    const ended = await harness.prisma.notification.findMany({
      where: { type: 'SUBSCRIPTION_ENDED' },
    });
    expect(ended).toHaveLength(1);
    expect(ended[0]?.audience).toBe('TRAINER');
  });

  it('recovers completely when a retry succeeds', async () => {
    const { due, periodEnd } = await onPlan();

    harness.payments.outcome = 'FAILED';
    await renew(due);
    expect((await harness.prisma.subscription.findFirstOrThrow()).status).toBe('PAST_DUE');

    harness.payments.outcome = 'SUCCEEDED';
    await renew(new Date(periodEnd.getTime() + DUNNING_RETRY_DAYS[0]! * DAY));

    const recovered = await harness.prisma.subscription.findFirstOrThrow();

    expect(recovered.status).toBe('ACTIVE');
    expect(recovered.failedAttempts).toBe(0);
    // Grace is gone: access is again exactly the paid period.
    expect(recovered.accessUntil.toISOString()).toBe(recovered.currentPeriodEnd.toISOString());
  });

  it('does not fire four attempts in four hours when the job was down for a week', async () => {
    const { periodEnd } = await onPlan();

    harness.payments.outcome = 'FAILED';
    const late = new Date(periodEnd.getTime() + 7 * DAY);
    await renew(late);

    const after = await harness.prisma.subscription.findFirstOrThrow();

    // The trainer must still get the window the policy promises them.
    expect(after.nextChargeAt?.getTime()).toBeGreaterThan(late.getTime());
    expect(after.accessUntil.getTime()).toBeGreaterThan(late.getTime());
  });
});

describe('the billing anniversary', () => {
  it('does not ratchet downward from a month end', async () => {
    const { subscriptionId } = await onPlan({
      periodStart: new Date('2026-01-31T12:00:00.000Z'),
    });

    const days: number[] = [];

    for (let i = 0; i < 3; i += 1) {
      const at = (
        await harness.prisma.subscription.findFirstOrThrow({ where: { id: subscriptionId } })
      ).nextChargeAt;

      if (at === null) break;

      await renew(new Date(at.getTime() + 1000));
      days.push(
        (
          await harness.prisma.subscription.findFirstOrThrow({ where: { id: subscriptionId } })
        ).currentPeriodEnd.getUTCDate(),
      );
    }

    // 31 Mar → 30 Apr → 31 May. Clamping against the previous CLAMPED date
    // instead of the anchor would have given 28, 28, 28 for ever.
    expect(days).toEqual([31, 30, 31]);
  });
});
