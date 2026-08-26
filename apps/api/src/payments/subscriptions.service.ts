import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DUNNING_MAX_ATTEMPTS,
  DUNNING_GRACE_DAYS,
  DUNNING_RETRY_DAYS,
  formatMoney,
  SUBSCRIPTION_PERIOD_MONTHS,
  type ClientSubscription,
  type PublicSubscription,
  type SubscriptionPeriod,
  type SubscriptionStatusFilter,
} from '@gart/shared';

import { addDays } from '../common/calendar';
import { toMoney } from '../common/money';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { Prisma } from '../generated/prisma/client.js';
import type { ClientModel, ProductModel, SubscriptionModel } from '../generated/prisma/models.js';
import { isAccessLive } from './access';

const NOT_CANCELLABLE_MESSAGE = 'Цю підписку вже скасовано або завершено';
const NOT_REACTIVATABLE_MESSAGE = 'Підписка вже завершилася — оформіть нову';

/** How many subscriptions one renewal run will attempt, so a backlog cannot stall a worker. */
const RENEWAL_BATCH = 200;

type SubscriptionWithParties = SubscriptionModel & {
  client: ClientModel;
  product: ProductModel;
};

/**
 * The lifecycle of a recurring arrangement: renewing it, chasing a failed
 * charge, stopping it, starting it again.
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

  /**
   * Starts a subscription, or advances the one that exists, inside the
   * transaction that granted the entitlement it was paid for.
   *
   * Called from the settlement path rather than beside it, so a subscription
   * can never be advanced for a payment that did not actually succeed.
   */
  async recordSuccess(
    tx: Prisma.TransactionClient,
    payment: {
      trainerId: string;
      clientId: string;
      productId: string;
      periodSnapshot: SubscriptionModel['period'] | null;
    },
    periodStart: Date,
    recurrenceRef: string | null,
  ): Promise<void> {
    if (payment.periodSnapshot === null) {
      return;
    }

    const existing = await tx.subscription.findUnique({
      where: { clientId_productId: { clientId: payment.clientId, productId: payment.productId } },
    });

    // A settlement for a period the row has already moved past — a webhook that
    // took the long way round — must not roll the arrangement backwards.
    if (existing !== null && existing.currentPeriodStart.getTime() > periodStart.getTime()) {
      return;
    }

    const anchorDay = existing?.anchorDay ?? periodStart.getUTCDate();
    const periodEnd = periodFrom(periodStart, payment.periodSnapshot, anchorDay);

    const cancelled = existing?.status === 'CANCELLED';

    // Upsert on the pair, so a client resubscribing after theirs ended reuses
    // the row rather than colliding with it.
    await tx.subscription.upsert({
      where: { clientId_productId: { clientId: payment.clientId, productId: payment.productId } },
      create: {
        trainerId: payment.trainerId,
        clientId: payment.clientId,
        productId: payment.productId,
        status: 'ACTIVE',
        period: payment.periodSnapshot,
        anchorDay,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        accessUntil: periodEnd,
        nextChargeAt: chargeAt(periodEnd),
        recurrenceRef,
      },
      update: {
        // A cancellation this charge raced is NOT undone. The money moved, so
        // the period is granted — but «stop charging me» was said and stands,
        // and erasing cancelledBy would leave support unable to see it happened.
        ...(cancelled
          ? { status: 'CANCELLED' as const, nextChargeAt: null }
          : {
              status: 'ACTIVE' as const,
              nextChargeAt: chargeAt(periodEnd),
              cancelledAt: null,
              cancelledBy: null,
            }),
        period: payment.periodSnapshot,
        anchorDay,
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

  /** Everything due at or before `now` — the renewal job's whole query. */
  async due(now: Date): Promise<SubscriptionWithParties[]> {
    return this.prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        nextChargeAt: { lte: now },
      },
      include: { client: true, product: true },
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
   * Recording the outcome afterwards only ever CORRECTS this: a success resets
   * the counter and advances the period; an exhausted failure ends it.
   *
   * Returns the attempt number, or null when somebody else claimed it.
   */
  async claim(subscription: SubscriptionWithParties, now: Date): Promise<number | null> {
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
   * Records that a claimed attempt did not go through.
   *
   * The schedule already moved when the attempt was claimed, so this only
   * speaks and, on the last attempt, closes the arrangement.
   *
   * The policy: both parties hear on the FIRST failure and on the LAST, and on
   * neither in between — a message per attempt is nagging, and the two that
   * matter are «something went wrong, you have time» and «it has stopped».
   */
  async recordFailure(subscriptionId: string, attempt: number): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { client: true, product: true },
    });

    // Gone, or already carried past this attempt by a success — nothing to say.
    if (subscription === null || subscription.failedAttempts !== attempt) {
      return;
    }

    if (attempt >= DUNNING_MAX_ATTEMPTS) {
      const { count } = await this.prisma.subscription.updateMany({
        where: { id: subscriptionId, failedAttempts: attempt, status: 'PAST_DUE' },
        data: { status: 'ENDED', nextChargeAt: null, accessUntil: new Date(), endedAt: new Date() },
      });

      if (count === 1) {
        await this.announceEnded(subscription);
      }

      return;
    }

    if (attempt === 1) {
      await this.announcePastDue(subscription);
    }
  }

  /**
   * Stops charging something that is no longer chargeable.
   *
   * A client who was archived cannot sign in, so they cannot reach the screen
   * that would let them cancel; a product that was retired, or whose cadence
   * the trainer has since changed, is no longer the thing anybody subscribed
   * to. Charging on regardless is the worst version of this feature.
   *
   * Recorded as a cancellation by the trainer, because that is what it is —
   * their action stopped it. Access runs to the end of the paid period, exactly
   * as any other cancellation.
   */
  async withdraw(subscription: SubscriptionWithParties, now: Date): Promise<void> {
    const { count } = await this.prisma.subscription.updateMany({
      where: { id: subscription.id, status: { in: ['ACTIVE', 'PAST_DUE'] } },
      data: { status: 'CANCELLED', nextChargeAt: null, cancelledAt: now, cancelledBy: 'TRAINER' },
    });

    if (count === 0) {
      return;
    }

    this.logger.log(`Subscription ${subscription.id} withdrawn from renewal`);

    await this.notifications.notifyClient({
      trainerId: subscription.trainerId,
      clientId: subscription.clientId,
      type: 'SUBSCRIPTION_ENDED',
      title: 'Підписку зупинено',
      body: `${subscription.product.name} —більше списань не буде`,
    });
  }

  /**
   * Ends an arrangement whose current period was refunded.
   *
   * The Entitlement is revoked by the settlement itself; this is the other
   * authority on access agreeing with it. Without this the subscription would
   * keep reporting live access for a period whose money went back, and would
   * charge again at the end of it.
   */
  async endAfterRefund(subscriptionId: string): Promise<void> {
    const now = new Date();

    await this.prisma.subscription.updateMany({
      where: { id: subscriptionId, status: { in: ['ACTIVE', 'PAST_DUE'] } },
      data: { status: 'ENDED', nextChargeAt: null, accessUntil: now, endedAt: now },
    });
  }

  /**
   * Closes anything whose retries are spent and whose access has run out.
   *
   * The safety net for an attempt that was claimed and never reported back —
   * a provider that answers by webhook and then never does. Without it such a
   * row would sit PAST_DUE for ever, with access already lapsed but the status
   * still claiming somebody is chasing it.
   */
  async endLapsed(now: Date): Promise<number> {
    const { count } = await this.prisma.subscription.updateMany({
      where: { status: 'PAST_DUE', nextChargeAt: null, accessUntil: { lte: now } },
      data: { status: 'ENDED', endedAt: now },
    });

    return count;
  }

  /**
   * When the next attempt happens.
   *
   * Anchored to the period end so a late run does not push the whole schedule
   * out — but never sooner than the gap the policy intends, so a job that was
   * down for a week does not fire all four attempts in four hours and give the
   * client no window at all to fix a card.
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

  /**
   * Stops future charges. Access runs to the end of what was paid for.
   *
   * Never a refund: money already taken is the refund path's business, and a
   * cancel button that returned money would make the two impossible to tell
   * apart at the moment somebody presses it.
   */
  async cancel(
    scope: { trainerId: string; clientId?: string },
    subscriptionId: string,
    by: 'CLIENT' | 'TRAINER',
    now: Date,
  ): Promise<SubscriptionWithParties> {
    const subscription = await this.requireOwned(scope, subscriptionId);

    if (subscription.status !== 'ACTIVE' && subscription.status !== 'PAST_DUE') {
      throw new BadRequestException(NOT_CANCELLABLE_MESSAGE);
    }

    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELLED', nextChargeAt: null, cancelledAt: now, cancelledBy: by },
      include: { client: true, product: true },
    });
  }

  /**
   * Resumes a cancelled subscription that has not yet run out.
   *
   * Once access has lapsed there is nothing to resume — the arrangement is
   * over, and starting again is a purchase, not a toggle.
   */
  async reactivate(
    scope: { trainerId: string; clientId?: string },
    subscriptionId: string,
    now: Date,
  ): Promise<SubscriptionWithParties> {
    const subscription = await this.requireOwned(scope, subscriptionId);

    if (subscription.status !== 'CANCELLED' || !this.isLive(subscription, now)) {
      throw new BadRequestException(NOT_REACTIVATABLE_MESSAGE);
    }

    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        // The next charge is when the paid period actually runs out, which is
        // what access was already going to do.
        nextChargeAt: subscription.accessUntil,
        cancelledAt: null,
        cancelledBy: null,
      },
      include: { client: true, product: true },
    });
  }

  async forTrainer(
    trainerId: string,
    status: SubscriptionStatusFilter,
    now: Date,
  ): Promise<PublicSubscription[]> {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { trainerId, ...(status === 'all' ? {} : { status }) },
      include: { client: true, product: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return subscriptions.map((subscription) => this.toPublic(subscription, now));
  }

  async forClient(trainerId: string, clientId: string, now: Date): Promise<ClientSubscription[]> {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { trainerId, clientId },
      include: { client: true, product: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return subscriptions.map((subscription) => this.toClient(subscription, now));
  }

  /** Whether access is live, through the one rule both authorities share. */
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

  toPublic(subscription: SubscriptionWithParties, now: Date): PublicSubscription {
    return {
      id: subscription.id,
      clientId: subscription.clientId,
      clientName: subscription.client.fullName,
      productId: subscription.productId,
      productName: subscription.product.name,
      price: toMoney(subscription.product.priceAmount, subscription.product.currency),
      period: subscription.period,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      accessUntil: subscription.accessUntil.toISOString(),
      nextChargeAt: subscription.nextChargeAt?.toISOString() ?? null,
      failedAttempts: subscription.failedAttempts,
      cancelledBy: subscription.cancelledBy,
      isActive: this.isLive(subscription, now),
    };
  }

  toClient(subscription: SubscriptionWithParties, now: Date): ClientSubscription {
    const live = this.isLive(subscription, now);

    return {
      id: subscription.id,
      productName: subscription.product.name,
      price: toMoney(subscription.product.priceAmount, subscription.product.currency),
      period: subscription.period,
      status: subscription.status,
      nextChargeAt: subscription.nextChargeAt?.toISOString() ?? null,
      accessUntil: subscription.accessUntil.toISOString(),
      failedAttempts: subscription.failedAttempts,
      isActive: live,
      canReactivate: subscription.status === 'CANCELLED' && live,
    };
  }

  private async requireOwned(
    scope: { trainerId: string; clientId?: string },
    subscriptionId: string,
  ): Promise<SubscriptionWithParties> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        trainerId: scope.trainerId,
        ...(scope.clientId === undefined ? {} : { clientId: scope.clientId }),
      },
      include: { client: true, product: true },
    });

    if (subscription === null) {
      throw new NotFoundException();
    }

    return subscription;
  }

  private async announcePastDue(subscription: SubscriptionWithParties): Promise<void> {
    const until = subscription.currentPeriodEnd;
    const price = formatMoney(
      toMoney(subscription.product.priceAmount, subscription.product.currency),
    );

    await Promise.all([
      this.notifications.notifyTrainer({
        trainerId: subscription.trainerId,
        clientId: subscription.clientId,
        type: 'SUBSCRIPTION_PAST_DUE',
        detail: `${subscription.product.name} · ${price}`,
      }),
      this.notifications.notifyClient({
        trainerId: subscription.trainerId,
        clientId: subscription.clientId,
        type: 'SUBSCRIPTION_PAST_DUE',
        title: 'Оплата не пройшла',
        body: `${subscription.product.name} — спробуємо ще раз. Доступ триває до ${formatDay(addDays(until, DUNNING_GRACE_DAYS))}`,
      }),
    ]);
  }

  private async announceEnded(subscription: SubscriptionWithParties): Promise<void> {
    await Promise.all([
      this.notifications.notifyTrainer({
        trainerId: subscription.trainerId,
        clientId: subscription.clientId,
        type: 'SUBSCRIPTION_ENDED',
        detail: subscription.product.name,
      }),
      this.notifications.notifyClient({
        trainerId: subscription.trainerId,
        clientId: subscription.clientId,
        type: 'SUBSCRIPTION_ENDED',
        title: 'Підписку призупинено',
        body: `${subscription.product.name} — оплату так і не отримано`,
      }),
    ]);

    this.logger.log(`Subscription ${subscription.id} ended after exhausted retries`);
  }
}

/**
 * When grace runs out after a first failed charge.
 *
 * Anchored to the period end, but never sooner than the same window measured
 * from NOW — because the window exists so that somebody can fix a card, and a
 * run that was late (a scheduler that never installed, an outage) would
 * otherwise announce a deadline that had already passed. The client is only
 * being told now; the time to act starts now.
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
 * period end would leave a paid-up client reading «неактивна» for up to an hour
 * every period while their own renewal was still being taken. An hour ahead is
 * imperceptible to the payer and closes the gap.
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
  // Kyiv, not UTC. A deadline announced in the wrong zone names a different
  // day than the app itself shows, in the one message whose whole purpose is a
  // date the client can act on.
  return new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'short',
    timeZone: 'Europe/Kyiv',
  }).format(date);
}
