import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DUNNING_GRACE_DAYS,
  DUNNING_MAX_ATTEMPTS,
  DUNNING_RETRY_DAYS,
  planPrice,
  SUBSCRIPTION_PERIOD_MONTHS,
  type PublicSubscription,
  type SubscriptionPeriod,
} from '@gart/shared';

import { addDays } from '../common/calendar';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationService } from '../notifications/notification.service';
import type { SubscriptionModel } from '../generated/prisma/models.js';
import { isAccessLive } from './access';

const NOT_CANCELLABLE_MESSAGE = 'Цю підписку вже скасовано або завершено';
const NOT_REACTIVATABLE_MESSAGE = 'Підписка вже завершилася — оформіть нову';

/** How many subscriptions one renewal run will attempt, so a backlog cannot stall a worker. */
const RENEWAL_BATCH = 200;

/**
 * The lifecycle of a trainer's subscription to Gart: renewing it, chasing a
 * failed charge, stopping it, starting it again.
 *
 * Deliberately a plain service the worker merely calls, the shape Step 19's
 * inactivity sweep established — so the whole rule is testable without Redis,
 * and `now` is an argument rather than a fact about the machine, which is what
 * makes the date-boundary tests honest.
 *
 * Charging itself is NOT here: a renewal is a Payment like any other and goes
 * through PaymentsService, which owns the one settlement path. This service
 * decides what is due and what a failure means.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  /** Everything due at or before `now` — the renewal job's whole query. */
  async due(now: Date): Promise<SubscriptionModel[]> {
    return this.prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'PAST_DUE'] }, nextChargeAt: { lte: now } },
      orderBy: [{ nextChargeAt: 'asc' }, { id: 'asc' }],
      take: RENEWAL_BATCH,
    });
  }

  /**
   * Claims a due subscription for one charge attempt, advancing the schedule
   * BEFORE the money is touched.
   *
   * This ordering is the whole design. The attempt number and the next attempt
   * date are written first, in a compare-and-set that only the winner passes —
   * so a crash, a provider timeout, a lost webhook or a second worker cannot
   * leave the row un-chargeable. Whatever happens next, the schedule has
   * already moved on, and the following run picks up the next attempt.
   *
   * Returns the attempt number, or null when somebody else claimed it.
   */
  async claim(subscription: SubscriptionModel, now: Date): Promise<number | null> {
    const attempt = subscription.failedAttempts + 1;
    const exhausted = attempt >= DUNNING_MAX_ATTEMPTS;

    const { count } = await this.prisma.subscription.updateMany({
      // The status and the counter are both in the WHERE, so a cancellation or
      // another worker between the batch read and here loses this attempt.
      where: {
        id: subscription.id,
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        failedAttempts: subscription.failedAttempts,
        nextChargeAt: { lte: now },
      },
      data: {
        failedAttempts: attempt,
        nextChargeAt: exhausted ? null : this.nextAttemptAt(subscription, attempt, now),
        // Provisional: a success immediately overwrites both of these. Written
        // now so that a charge which never reports back still leaves the row in
        // an honest state — being retried, with access held open.
        status: 'PAST_DUE',
        ...(attempt === 1 ? { accessUntil: graceUntil(subscription.currentPeriodEnd, now) } : {}),
      },
    });

    return count === 1 ? attempt : null;
  }

  /**
   * Advances a subscription that has just been paid for.
   *
   * Runs INSIDE the transaction that settled the payment, and that is not a
   * detail. Outside it, a crash between the two writes would leave a charge
   * taken and the subscription still owing — with no path back, because a
   * payment that already reads SUCCEEDED can never be re-driven: a replayed
   * delivery collides on PaymentEvent, and a fresh one fails the transition
   * table. The next run would then spend a second attempt and charge the same
   * period twice. The transaction is also what holds the row lock that stops a
   * concurrent `claim` being erased by this read-modify-write.
   *
   * Guarded as well as atomic: a settlement for a period the row has already
   * moved past — a webhook that took the long way round — must not roll the
   * arrangement backwards, and a cancellation this charge raced is not undone.
   */
  async recordSuccess(
    tx: Prisma.TransactionClient,
    subscriptionId: string,
    periodStart: Date,
    recurrenceRef: string | null,
  ): Promise<void> {
    const existing = await tx.subscription.findUnique({ where: { id: subscriptionId } });

    if (existing === null || existing.currentPeriodStart.getTime() > periodStart.getTime()) {
      return;
    }

    const periodEnd = periodFrom(periodStart, existing.period, existing.anchorDay);
    const cancelled = existing.status === 'CANCELLED';

    await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        // A cancellation this charge raced is NOT undone. The money moved, so
        // the period is granted — but «stop charging me» was said and stands.
        ...(cancelled
          ? { status: 'CANCELLED' as const, nextChargeAt: null }
          : { status: 'ACTIVE' as const, nextChargeAt: chargeAt(periodEnd), cancelledAt: null }),
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        accessUntil: periodEnd,
        failedAttempts: 0,
        endedAt: null,
        // A renewal charges the mandate it already has; only a fresh checkout
        // brings a new one, and null must not erase a working one.
        ...(recurrenceRef === null ? {} : { recurrenceRef }),
      },
    });
  }

  /**
   * Records that a claimed attempt did not go through.
   *
   * The schedule already moved when the attempt was claimed, so this only
   * speaks and, on the last attempt, closes the arrangement.
   *
   * The policy: the trainer hears on the FIRST failure and on the LAST, and on
   * neither in between — a message per attempt is nagging, and the two that
   * matter are «something went wrong, you have time» and «it has stopped».
   */
  async recordFailure(subscriptionId: string, attempt: number): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    // Gone, or already carried past this attempt by a success — nothing to say.
    if (subscription === null || subscription.failedAttempts !== attempt) {
      return;
    }

    if (attempt >= DUNNING_MAX_ATTEMPTS) {
      const now = new Date();
      const { count } = await this.prisma.subscription.updateMany({
        where: { id: subscriptionId, failedAttempts: attempt, status: 'PAST_DUE' },
        data: { status: 'ENDED', nextChargeAt: null, accessUntil: now, endedAt: now },
      });

      if (count === 1) {
        await this.announce(
          subscription,
          'SUBSCRIPTION_ENDED',
          'Підписку призупинено',
          `Gart ${subscription.plan} — оплату так і не отримано`,
        );
      }

      return;
    }

    if (attempt === 1) {
      await this.announce(
        subscription,
        'SUBSCRIPTION_PAST_DUE',
        'Оплата не пройшла',
        `Gart ${subscription.plan} — спробуємо ще раз. Доступ триває до ${formatDay(subscription.accessUntil)}`,
      );
    }
  }

  /**
   * Closes anything whose retries are spent and whose access has run out.
   *
   * The safety net for an attempt that was claimed and never reported back — a
   * provider that answers by webhook and then never does. Without it such a row
   * would sit PAST_DUE for ever, with access already lapsed but the status
   * still claiming somebody is chasing it.
   */
  async endLapsed(now: Date): Promise<number> {
    const { count } = await this.prisma.subscription.updateMany({
      where: { status: 'PAST_DUE', nextChargeAt: null, accessUntil: { lte: now } },
      data: { status: 'ENDED', endedAt: now },
    });

    return count;
  }

  /** Ends an arrangement whose current period was refunded. */
  async endAfterRefund(subscriptionId: string): Promise<void> {
    const now = new Date();

    await this.prisma.subscription.updateMany({
      // CANCELLED too: a cancelled subscription keeps access to the end of the
      // period it paid for, which is exactly the access a refund takes back.
      // Excluding it left a trainer with their money AND their workspace.
      where: { id: subscriptionId, status: { in: ['ACTIVE', 'PAST_DUE', 'CANCELLED'] } },
      data: { status: 'ENDED', nextChargeAt: null, accessUntil: now, endedAt: now },
    });
  }

  /** Stops charging something with no mandate to charge against. */
  async withdraw(subscription: SubscriptionModel): Promise<void> {
    const { count } = await this.prisma.subscription.updateMany({
      where: { id: subscription.id, status: { in: ['ACTIVE', 'PAST_DUE'] } },
      data: { status: 'CANCELLED', nextChargeAt: null, cancelledAt: new Date() },
    });

    if (count === 1) {
      this.logger.log(`Subscription ${subscription.id} withdrawn: no mandate to charge`);
    }
  }

  /**
   * Stops future charges. Access runs to the end of what was paid for.
   *
   * Never a refund: money already taken is the refund path's business, and a
   * cancel button that returned money would make the two impossible to tell
   * apart at the moment somebody presses it.
   */
  async cancel(trainerId: string, now: Date): Promise<SubscriptionModel> {
    const subscription = await this.requireOwned(trainerId);

    if (subscription.status !== 'ACTIVE' && subscription.status !== 'PAST_DUE') {
      throw new BadRequestException(NOT_CANCELLABLE_MESSAGE);
    }

    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELLED', nextChargeAt: null, cancelledAt: now },
    });
  }

  /**
   * Resumes a cancelled subscription that has not yet run out.
   *
   * Once access has lapsed there is nothing to resume — the arrangement is
   * over, and starting again is a purchase, not a toggle.
   */
  async reactivate(trainerId: string, now: Date): Promise<SubscriptionModel> {
    const subscription = await this.requireOwned(trainerId);

    if (subscription.status !== 'CANCELLED' || !this.isLive(subscription, now)) {
      throw new BadRequestException(NOT_REACTIVATABLE_MESSAGE);
    }

    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        // An hour before access runs out, not at the instant it does — the same
        // lead every other charge gets, so a resumed subscription does not
        // blink where a never-cancelled one never would.
        nextChargeAt: chargeAt(subscription.accessUntil),
        // A clean ladder. Resuming mid-dunning otherwise re-entered at attempt
        // two: no grace re-granted, no first-failure message, and fewer chances
        // than the policy promises.
        failedAttempts: 0,
        cancelledAt: null,
      },
    });
  }

  /** The trainer's own subscription, or null if they have never had one. */
  async forTrainer(trainerId: string, now: Date): Promise<PublicSubscription | null> {
    const subscription = await this.prisma.subscription.findUnique({ where: { trainerId } });

    return subscription === null ? null : this.toPublic(subscription, now);
  }

  /** Whether the workspace is live, through the one shared rule. */
  isLive(subscription: SubscriptionModel, now: Date): boolean {
    return isAccessLive(
      {
        startsAt: subscription.currentPeriodStart,
        endsAt: subscription.accessUntil,
        revokedAt: null,
      },
      now,
    );
  }

  toPublic(subscription: SubscriptionModel, now: Date): PublicSubscription {
    const live = this.isLive(subscription, now);

    return {
      id: subscription.id,
      plan: subscription.plan,
      period: subscription.period,
      price: planPrice(subscription.plan, subscription.period),
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      accessUntil: subscription.accessUntil.toISOString(),
      nextChargeAt: subscription.nextChargeAt?.toISOString() ?? null,
      failedAttempts: subscription.failedAttempts,
      isActive: live,
      canReactivate: subscription.status === 'CANCELLED' && live,
    };
  }

  /**
   * When the next attempt happens.
   *
   * Anchored to the period end so a late run does not push the whole schedule
   * out — but never sooner than the gap the policy intends, so a job that was
   * down for a week does not fire all four attempts in four hours and give the
   * trainer no window at all to fix a card.
   */
  private nextAttemptAt(subscription: SubscriptionModel, attempt: number, now: Date): Date {
    const offset = DUNNING_RETRY_DAYS[attempt - 1];

    if (offset === undefined) {
      // Unreachable: `attempt` is bounded by DUNNING_MAX_ATTEMPTS at the only
      // call site, which is derived from this very table.
      throw new Error(`No retry scheduled for attempt ${String(attempt)}`);
    }

    const previous = attempt === 1 ? 0 : (DUNNING_RETRY_DAYS[attempt - 2] ?? 0);
    const scheduled = addDays(subscription.currentPeriodEnd, offset);
    const spaced = addDays(now, offset - previous);

    return scheduled.getTime() > spaced.getTime() ? scheduled : spaced;
  }

  private async requireOwned(trainerId: string): Promise<SubscriptionModel> {
    const subscription = await this.prisma.subscription.findUnique({ where: { trainerId } });

    if (subscription === null) {
      throw new NotFoundException();
    }

    return subscription;
  }

  /** One door for both billing messages, since neither concerns a client. */
  private async announce(
    subscription: SubscriptionModel,
    type: 'SUBSCRIPTION_PAST_DUE' | 'SUBSCRIPTION_ENDED',
    title: string,
    body: string,
  ): Promise<void> {
    await this.notifications.notifyTrainerDirect({
      trainerId: subscription.trainerId,
      type,
      title,
      body,
      url: '/dashboard',
    });
  }
}

/**
 * When grace runs out after a first failed charge.
 *
 * Anchored to the period end, but never sooner than the same window measured
 * from NOW — because the window exists so that somebody can fix a card, and a
 * run that was late would otherwise announce a deadline that had already passed.
 */
function graceUntil(periodEnd: Date, now: Date): Date {
  const fromPeriod = addDays(periodEnd, DUNNING_GRACE_DAYS);
  const fromNow = addDays(now, DUNNING_GRACE_DAYS);

  return fromPeriod.getTime() > fromNow.getTime() ? fromPeriod : fromNow;
}

/**
 * How long before the period ends the renewal is attempted.
 *
 * Access is end-exclusive and the job runs hourly, so charging exactly AT the
 * period end would leave a paid-up trainer locked out for up to an hour every
 * period while their own renewal was still being taken.
 */
const RENEWAL_LEAD_MS = 60 * 60 * 1000;

export function chargeAt(periodEnd: Date): Date {
  return new Date(periodEnd.getTime() - RENEWAL_LEAD_MS);
}

/**
 * The end of a period that starts at `from`, billed on `anchorDay`.
 *
 * The clamp is applied to the ANCHOR, never to the previous clamped date —
 * otherwise 31 January becomes 28 February and then 28 March, and the
 * anniversary ratchets downward for the rest of the subscription's life.
 */
export function periodFrom(from: Date, period: SubscriptionPeriod, anchorDay: number): Date {
  const months = SUBSCRIPTION_PERIOD_MONTHS[period];
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(anchorDay, lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

/** «26.08.2026» — a date a person can act on, in a notification body. */
function formatDay(date: Date): string {
  // Kyiv, not UTC. A deadline announced in the wrong zone names a different day
  // than the app itself shows, in the one message whose whole purpose is a date
  // the trainer can act on.
  return new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'short',
    timeZone: 'Europe/Kyiv',
  }).format(date);
}
