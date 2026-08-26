import request from 'supertest';
import { DUNNING_GRACE_DAYS, DUNNING_MAX_ATTEMPTS, DUNNING_RETRY_DAYS } from '@gart/shared';

import { Prisma } from '../src/generated/prisma/client.js';
import { PaymentsService } from '../src/payments/payments.service';
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

const DAY = 24 * 60 * 60 * 1000;

function renew(now: Date): Promise<number> {
  return harness.app.get(PaymentsService).renewDue(now);
}

interface Subscribed {
  cookie: string;
  clientCookie: string;
  clientId: string;
  productId: string;
  subscriptionId: string;
}

/** A trainer, a client, a monthly product, and one paid first period. */
async function subscribe(price = '900.00'): Promise<Subscribed> {
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
      kind: 'SUBSCRIPTION',
      period: 'MONTHLY',
      priceAmount: new Prisma.Decimal(price),
      currency: 'UAH',
    },
  });

  await request(harness.app.getHttpServer())
    .post(`/clients/${clientId}/payments`)
    .set('Cookie', cookie)
    .send({ productId: product.id })
    .expect(201);

  const subscription = await harness.prisma.subscription.findFirstOrThrow();

  return {
    cookie,
    clientCookie,
    clientId,
    productId: product.id,
    subscriptionId: subscription.id,
  };
}

describe('starting a subscription', () => {
  it('opens one when a subscription product is first paid for', async () => {
    await subscribe();

    const subscription = await harness.prisma.subscription.findFirstOrThrow();

    expect(subscription.status).toBe('ACTIVE');
    expect(subscription.period).toBe('MONTHLY');
    expect(subscription.failedAttempts).toBe(0);
    // Access runs exactly to the paid period — no grace, because nothing has
    // failed.
    expect(subscription.accessUntil.toISOString()).toBe(
      subscription.currentPeriodEnd.toISOString(),
    );

    // The charge is attempted an hour BEFORE that. Access is end-exclusive and
    // the job runs hourly, so charging exactly at the boundary would leave a
    // paid-up client reading «неактивна» for up to an hour every period while
    // their own renewal was still being taken.
    expect(subscription.nextChargeAt?.getTime()).toBe(
      subscription.currentPeriodEnd.getTime() - 60 * 60 * 1000,
    );
    expect(subscription.nextChargeAt?.getTime()).toBeLessThan(subscription.accessUntil.getTime());
  });

  it('opens none for a one-time purchase', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const user = await harness.prisma.user.findFirstOrThrow({
      where: { email: validRegistration.email },
      include: { trainer: true },
    });

    const product = await harness.prisma.product.create({
      data: {
        trainerId: user.trainer?.id ?? '',
        name: 'Разовий блок',
        kind: 'ONE_TIME',
        priceAmount: new Prisma.Decimal('1500.00'),
        currency: 'UAH',
        accessDays: 30,
      },
    });

    await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId: product.id })
      .expect(201);

    expect(await harness.prisma.subscription.count()).toBe(0);
  });
});

describe('renewing', () => {
  it('charges exactly once when due, and advances the period', async () => {
    const { subscriptionId } = await subscribe();
    const before = await harness.prisma.subscription.findFirstOrThrow();

    expect(await renew(before.nextChargeAt ?? new Date())).toBe(1);

    const after = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    expect(after.status).toBe('ACTIVE');
    expect(after.currentPeriodStart.toISOString()).toBe(before.currentPeriodEnd.toISOString());
    expect(after.currentPeriodEnd.getTime()).toBeGreaterThan(before.currentPeriodEnd.getTime());

    // Two payments, two entitlements — the ledger grew, it did not change.
    expect(await harness.prisma.payment.count()).toBe(2);
    expect(await harness.prisma.entitlement.count()).toBe(2);
  });

  it('is a NO-OP when the job runs again for the same period', async () => {
    const { subscriptionId } = await subscribe();
    const due = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt ?? new Date();

    await renew(due);
    const afterFirst = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    // Put it back on the same due date, as a re-run of the same tick would find
    // it if the first run's advance had not been committed.
    await harness.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { nextChargeAt: due, currentPeriodEnd: afterFirst.currentPeriodStart },
    });

    expect(await renew(due)).toBe(0);

    // The DATABASE refused the second charge, not a check in the service.
    expect(await harness.prisma.payment.count()).toBe(2);
    expect(await harness.prisma.entitlement.count()).toBe(2);
  });

  it('refuses a duplicate ATTEMPT at the database even with the service bypassed', async () => {
    const { subscriptionId } = await subscribe();
    const payment = await harness.prisma.payment.findFirstOrThrow();
    const periodStart = new Date('2026-10-01T00:00:00.000Z');

    await harness.prisma.payment.update({
      where: { id: payment.id },
      data: { subscriptionId, periodStart, periodAttempt: 1 },
    });

    await expect(
      harness.prisma.payment.create({
        data: {
          trainerId: payment.trainerId,
          clientId: payment.clientId,
          productId: payment.productId,
          subscriptionId,
          periodStart,
          periodAttempt: 1,
          amount: payment.amount,
          currency: payment.currency,
          provider: 'fake',
          description: 'duplicate period',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('does not charge before it is due', async () => {
    await subscribe();
    const due = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt ?? new Date();

    // One millisecond short of the boundary.
    expect(await renew(new Date(due.getTime() - 1))).toBe(0);
    expect(await harness.prisma.payment.count()).toBe(1);

    // And exactly at it.
    expect(await renew(due)).toBe(1);
  });

  it('prices the new period at ITS OWN time, never retroactively', async () => {
    const { cookie, productId, subscriptionId } = await subscribe('900.00');
    const first = await harness.prisma.payment.findFirstOrThrow();

    expect(first.amount.toFixed(2)).toBe('900.00');
    expect(first.platformFee.toFixed(2)).toBe('45.00');

    await request(harness.app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ price: '1200.00' })
      .expect(200);

    const due = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt ?? new Date();
    await renew(due);

    const renewal = await harness.prisma.payment.findFirstOrThrow({
      where: { subscriptionId, NOT: { id: first.id } },
    });

    // The new period costs the new price and carries the fee on it...
    expect(renewal.amount.toFixed(2)).toBe('1200.00');
    expect(renewal.platformFee.toFixed(2)).toBe('60.00');

    // ...and the period already paid for is untouched.
    const unchanged = await harness.prisma.payment.findFirstOrThrow({ where: { id: first.id } });
    expect(unchanged.amount.toFixed(2)).toBe('900.00');
    expect(unchanged.platformFee.toFixed(2)).toBe('45.00');
  });

  it('starts the new period where the last one ended, not when the callback landed', async () => {
    const { subscriptionId } = await subscribe();
    const before = await harness.prisma.subscription.findFirstOrThrow();
    const periodEnd = before.currentPeriodEnd;

    // The job runs two hours late.
    await renew(new Date(periodEnd.getTime() + 2 * 60 * 60 * 1000));

    const renewal = await harness.prisma.entitlement.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
    });

    // Otherwise the anniversary would drift two hours later every period.
    expect(renewal.startsAt.toISOString()).toBe(periodEnd.toISOString());
    expect(
      (
        await harness.prisma.subscription.findFirstOrThrow({ where: { id: subscriptionId } })
      ).currentPeriodStart.toISOString(),
    ).toBe(periodEnd.toISOString());
  });
});

describe('when a charge never reports back', () => {
  it('still advances the schedule when the provider answers only by webhook', async () => {
    const { subscriptionId } = await subscribe();
    const due = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt ?? new Date();

    // The LiqPay-shaped model: charged, answer to follow. Nothing settles now.
    harness.payments.outcome = 'PENDING';
    await renew(due);

    const claimed = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    // The attempt was CLAIMED before the money was touched, so the row has
    // already moved on — the answer never coming costs one attempt, not the
    // subscription.
    expect(claimed.failedAttempts).toBe(1);
    expect(claimed.nextChargeAt).not.toBeNull();
    expect(claimed.nextChargeAt?.getTime()).toBeGreaterThan(due.getTime());
    // And access is held open while it is chased.
    expect(claimed.accessUntil.getTime()).toBeGreaterThan(claimed.currentPeriodEnd.getTime());
  });

  it('is not wedged by a provider that throws', async () => {
    const { subscriptionId } = await subscribe();
    const due = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt ?? new Date();

    harness.payments.unavailable = true;
    await renew(due);
    harness.payments.unavailable = false;

    const after = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    // Before the claim-first ordering this left the row un-chargeable for ever:
    // the attempt number never moved, so every later run collided with its own
    // half-finished payment and did nothing.
    expect(after.failedAttempts).toBe(1);
    expect(after.status).toBe('PAST_DUE');
    expect(after.nextChargeAt).not.toBeNull();

    // And the next attempt genuinely goes through.
    harness.payments.outcome = 'SUCCEEDED';
    expect(await renew(after.nextChargeAt ?? new Date())).toBe(1);
    expect((await harness.prisma.subscription.findFirstOrThrow()).status).toBe('ACTIVE');
  });

  it('runs the whole ladder for a webhook-only provider, and ends it', async () => {
    const { subscriptionId } = await subscribe();
    harness.payments.outcome = 'PENDING';

    for (let i = 0; i < 4; i += 1) {
      const at = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt;

      if (at === null) break;

      await renew(at);
    }

    const after = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    // Four attempts claimed, no answers, retries spent.
    expect(after.failedAttempts).toBe(4);
    expect(after.nextChargeAt).toBeNull();

    // The safety net closes it once access has actually run out, rather than
    // leaving it PAST_DUE for ever with nobody chasing it.
    await renew(new Date(after.accessUntil.getTime() + 1000));

    expect((await harness.prisma.subscription.findFirstOrThrow()).status).toBe('ENDED');
  });

  it('does not fire four attempts in four hours when the job was down for a week', async () => {
    const { subscriptionId } = await subscribe();
    const periodEnd = (await harness.prisma.subscription.findFirstOrThrow()).currentPeriodEnd;

    harness.payments.outcome = 'FAILED';

    // The scheduler was never installed; the first attempt happens a week late,
    // by which point every retry date computed from the period end is past.
    const late = new Date(periodEnd.getTime() + 7 * DAY);
    await renew(late);

    const after = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    // The client must still get the window the policy promises them.
    expect(after.nextChargeAt?.getTime()).toBeGreaterThan(late.getTime());
    expect(after.accessUntil.getTime()).toBeGreaterThan(late.getTime());
  });
});

describe('a product or client that can no longer be charged', () => {
  it('stops charging an archived client instead of billing someone who cannot cancel', async () => {
    const { cookie, clientId, subscriptionId } = await subscribe();

    await request(harness.app.getHttpServer())
      .patch(`/clients/${clientId}`)
      .set('Cookie', cookie)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    const due = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt ?? new Date();
    expect(await renew(due)).toBe(0);

    const after = await harness.prisma.subscription.findFirstOrThrow({
      where: { id: subscriptionId },
    });

    // An archived client cannot sign in, so they could never reach the screen
    // that would let them stop it themselves.
    expect(after.status).toBe('CANCELLED');
    expect(after.nextChargeAt).toBeNull();
    expect(await harness.prisma.payment.count()).toBe(1);
  });

  it('stops charging when the product is deactivated', async () => {
    const { cookie, productId } = await subscribe();

    await request(harness.app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ isActive: false })
      .expect(200);

    const due = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt ?? new Date();
    await renew(due);

    expect((await harness.prisma.subscription.findFirstOrThrow()).status).toBe('CANCELLED');
    expect(await harness.prisma.payment.count()).toBe(1);
  });

  it('stops charging when the cadence the client subscribed to no longer exists', async () => {
    const { cookie, productId } = await subscribe();

    // Price comes from the live product but the term is frozen, so an annual
    // price on a monthly cadence would bill ₴9000 twelve times a year.
    await request(harness.app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ period: 'ANNUAL', price: '9000.00' })
      .expect(200);

    const due = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt ?? new Date();
    await renew(due);

    expect((await harness.prisma.subscription.findFirstOrThrow()).status).toBe('CANCELLED');
    expect(await harness.prisma.payment.count()).toBe(1);
  });
});

describe('the billing anniversary', () => {
  it('does not ratchet downward from a month end', async () => {
    const { subscriptionId } = await subscribe();

    // Anchored on the 31st, the day a month-end subscriber signed up.
    await harness.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        anchorDay: 31,
        currentPeriodStart: new Date('2026-01-31T12:00:00.000Z'),
        currentPeriodEnd: new Date('2026-02-28T12:00:00.000Z'),
        accessUntil: new Date('2026-02-28T12:00:00.000Z'),
        nextChargeAt: new Date('2026-02-28T11:00:00.000Z'),
      },
    });

    const days: number[] = [];

    for (let i = 0; i < 3; i += 1) {
      const at = (await harness.prisma.subscription.findFirstOrThrow()).nextChargeAt;

      if (at === null) break;

      await renew(new Date(at.getTime() + 1000));
      days.push(
        (await harness.prisma.subscription.findFirstOrThrow()).currentPeriodEnd.getUTCDate(),
      );
    }

    // 28 Feb → 31 Mar → 30 Apr → 31 May. Clamping against the previous CLAMPED
    // date instead of the anchor would have given 28, 28, 28 for ever.
    expect(days).toEqual([31, 30, 31]);
  });
});

describe('the dunning schedule', () => {
  async function failRenewal(subscriptionId: string): Promise<void> {
    harness.payments.outcome = 'FAILED';
    const due = (
      await harness.prisma.subscription.findFirstOrThrow({ where: { id: subscriptionId } })
    ).nextChargeAt;

    await renew(due ?? new Date());
  }

  it('keeps access alive on the first failure, and grants exactly the grace window', async () => {
    const { subscriptionId } = await subscribe();
    const periodEnd = (await harness.prisma.subscription.findFirstOrThrow()).currentPeriodEnd;

    await failRenewal(subscriptionId);

    const after = await harness.prisma.subscription.findFirstOrThrow();

    expect(after.status).toBe('PAST_DUE');
    expect(after.failedAttempts).toBe(1);
    // Access outlives the paid period by exactly the grace window.
    expect(after.accessUntil.getTime()).toBe(periodEnd.getTime() + DUNNING_GRACE_DAYS * DAY);
    // And the first retry is on the first retry day, measured from the period
    // end rather than from the attempt.
    expect(after.nextChargeAt?.getTime()).toBe(periodEnd.getTime() + DUNNING_RETRY_DAYS[0]! * DAY);
  });

  it('retries on exactly the days the policy names, and lapses only on the last', async () => {
    const { subscriptionId } = await subscribe();
    const periodEnd = (await harness.prisma.subscription.findFirstOrThrow()).currentPeriodEnd;

    await failRenewal(subscriptionId);
    expect((await harness.prisma.subscription.findFirstOrThrow()).failedAttempts).toBe(1);

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
    expect(ended.endedAt).not.toBeNull();
    // Access lapses now, and not before.
    expect(ended.accessUntil.getTime()).toBeLessThanOrEqual(
      periodEnd.getTime() + DUNNING_GRACE_DAYS * DAY,
    );
  });

  it('grants grace once, not once per attempt', async () => {
    const { subscriptionId } = await subscribe();
    const periodEnd = (await harness.prisma.subscription.findFirstOrThrow()).currentPeriodEnd;

    await failRenewal(subscriptionId);
    const afterFirst = (await harness.prisma.subscription.findFirstOrThrow()).accessUntil;

    await renew(new Date(periodEnd.getTime() + DUNNING_RETRY_DAYS[0]! * DAY));

    // Otherwise every retry would buy another five days and it would never end.
    expect((await harness.prisma.subscription.findFirstOrThrow()).accessUntil.toISOString()).toBe(
      afterFirst.toISOString(),
    );
  });

  it('speaks twice and no more: on the first failure and on the last', async () => {
    const { subscriptionId } = await subscribe();
    const periodEnd = (await harness.prisma.subscription.findFirstOrThrow()).currentPeriodEnd;

    harness.queue.reset();
    await harness.prisma.notification.deleteMany();

    await failRenewal(subscriptionId);

    const afterFirst = await harness.prisma.notification.findMany();

    // Two, not four: the payment-level failure stays quiet for a renewal,
    // because dunning says the same thing and adds the date that matters.
    expect(afterFirst).toHaveLength(2);
    expect(afterFirst.every((n) => n.type === 'SUBSCRIPTION_PAST_DUE')).toBe(true);
    expect(afterFirst.filter((n) => n.audience === 'CLIENT')).toHaveLength(1);
    expect(afterFirst.filter((n) => n.audience === 'TRAINER')).toHaveLength(1);

    // And the client's message carries the date they can act on.
    const toClient = afterFirst.find((n) => n.audience === 'CLIENT');
    expect(toClient?.body).toContain('Доступ триває до');

    // The middle retries say nothing — a message per attempt is nagging.
    await renew(new Date(periodEnd.getTime() + DUNNING_RETRY_DAYS[0]! * DAY));
    expect(await harness.prisma.notification.count()).toBe(2);

    await renew(new Date(periodEnd.getTime() + DUNNING_RETRY_DAYS[1]! * DAY));
    expect(await harness.prisma.notification.count()).toBe(2);

    // The last one does.
    await renew(new Date(periodEnd.getTime() + DUNNING_RETRY_DAYS[2]! * DAY));

    const ended = await harness.prisma.notification.findMany({
      where: { type: 'SUBSCRIPTION_ENDED' },
    });
    expect(ended).toHaveLength(2);
    expect(ended.filter((n) => n.audience === 'CLIENT')).toHaveLength(1);
    expect(ended.filter((n) => n.audience === 'TRAINER')).toHaveLength(1);
  });

  it('recovers completely when a retry succeeds', async () => {
    const { subscriptionId } = await subscribe();
    const periodEnd = (await harness.prisma.subscription.findFirstOrThrow()).currentPeriodEnd;

    await failRenewal(subscriptionId);
    expect((await harness.prisma.subscription.findFirstOrThrow()).status).toBe('PAST_DUE');

    harness.payments.outcome = 'SUCCEEDED';
    await renew(new Date(periodEnd.getTime() + DUNNING_RETRY_DAYS[0]! * DAY));

    const recovered = await harness.prisma.subscription.findFirstOrThrow();

    expect(recovered.status).toBe('ACTIVE');
    expect(recovered.failedAttempts).toBe(0);
    // Grace is gone: access is again exactly the paid period.
    expect(recovered.accessUntil.toISOString()).toBe(recovered.currentPeriodEnd.toISOString());
  });
});
