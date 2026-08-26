import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  formatMoney,
  planPrice,
  type PaymentStatus,
  type PublicPayment,
  type SubscriptionPeriod,
  type SubscriptionPlan,
} from '@gart/shared';

import { toMoney } from '../common/money';
import { PrismaService } from '../database/prisma.service';
import { requireEnv } from '../env';
import { Prisma } from '../generated/prisma/client.js';
import type { PaymentModel, SubscriptionModel } from '../generated/prisma/models.js';
import { amountsEqual } from '../common/money';
import {
  CALLBACK_MAX_AGE_MS,
  CALLBACK_MAX_SKEW_MS,
  InvalidCallbackError,
  PaymentProvider,
  type ProviderCallback,
  type RawCallback,
} from './payment-provider';
import { payloadDigest } from './signature';
import { SubscriptionsService } from './subscriptions.service';

const UNIQUE_CONSTRAINT_ERROR = 'P2002';

/**
 * The attempt number an OPENING checkout is recorded under.
 *
 * Zero, because it is not a dunning attempt: attempts 1..4 are the unattended
 * retries the ladder makes against a stored mandate, and this is the one charge
 * a payer is actually present for. It shares the
 * `(subscriptionId, periodStart, periodAttempt)` key with them, so it gets the
 * same database-level idempotency without a column of its own, and it is what
 * tells a settlement that this payment STARTS an arrangement rather than
 * continuing one.
 */
const OPENING_ATTEMPT = 0;

const CHECKOUT_IN_FLIGHT_MESSAGE = 'Оплата вже відкривається — спробуйте ще раз за мить';

/**
 * Which state a payment must already be in for an arriving status to apply.
 *
 * Acquirers do not promise ordered delivery, and they retry. Without this, a
 * `processing` delivery emitted before a `success` one but retried after it
 * would walk a paid payment back to PENDING. A refund is the one move allowed
 * out of SUCCEEDED; nothing moves out of FAILED except a retry that works,
 * because a payer reaching for a second card is charged against the same order.
 */
const ALLOWED_FROM: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ['PENDING'],
  SUCCEEDED: ['PENDING', 'FAILED'],
  FAILED: ['PENDING'],
  REFUNDED: ['SUCCEEDED', 'PENDING'],
};

type PaymentWithSubscription = PaymentModel & { subscription: SubscriptionModel | null };
type SubscriptionWithTrainer = SubscriptionModel;

/**
 * Collecting what a trainer owes for their Gart subscription.
 *
 * The service never learns which acquirer is behind PaymentProvider. It hands
 * over an order reference and an amount, and is handed back a verified result
 * in its own vocabulary.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  /**
   * Read once, at construction. A deploy missing it would otherwise boot
   * cleanly, pass its health check, and fail on the first charge.
   */
  private readonly apiOrigin = requireEnv('API_ORIGIN');

  /** Where the acquirer sends the trainer back to. Read once, for the same reason. */
  private readonly webOrigin = requireEnv('WEB_ORIGIN');

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /**
   * Opens a checkout that both takes the first period's money and establishes
   * the mandate every renewal after it will charge.
   *
   * Returns where to send the trainer. Nothing is granted here — access follows
   * the settlement, through the same `applyCallback` a renewal and a webhook
   * both go through, so there is exactly one place in this system where a
   * payment turns into access.
   */
  async openSubscription(
    trainerId: string,
    plan: SubscriptionPlan,
    period: SubscriptionPeriod,
    now = new Date(),
  ): Promise<{ redirectUrl: string }> {
    const subscription = await this.subscriptions.assertCanOpenCheckout(trainerId, plan);
    const price = planPrice(plan, period);

    // What is being bought lives HERE and nowhere else. The subscription row is
    // untouched until money settles, so a checkout the trainer abandons cannot
    // change the terms of an arrangement nobody paid for.
    const payment = await this.prisma.payment
      .create({
        data: {
          trainerId,
          subscriptionId: subscription.id,
          periodStart: now,
          periodAttempt: OPENING_ATTEMPT,
          amount: new Prisma.Decimal(price.amount),
          currency: price.currency,
          status: 'PENDING',
          provider: this.provider.id,
          description: `Gart ${plan}`,
          planSnapshot: plan,
          periodSnapshot: period,
        },
        include: { subscription: true },
      })
      .catch((error: unknown) => {
        // Two checkouts opened in the same millisecond collide on
        // `(subscriptionId, periodStart, periodAttempt)`. Vanishingly unlikely,
        // and a 500 would be the wrong answer to «you pressed it twice».
        if (isUniqueConstraintError(error)) {
          throw new BadRequestException(CHECKOUT_IN_FLIGHT_MESSAGE);
        }

        throw error;
      });

    const session = await this.provider.openSubscription({
      orderRef: payment.id,
      amount: price,
      description: `Gart ${plan}`,
      callbackUrl: `${this.apiOrigin}/payments/callback/${this.provider.id}`,
      returnUrl: `${this.webOrigin}/dashboard/billing`,
      metadata: { trainerId },
    });

    await this.recordSession(payment.id, session);

    // A provider that settled without a round trip — the fake, and any acquirer
    // that ever charges inline. Fed through the identical settle path rather
    // than a shortcut, so the checkout's happy path exercises signature
    // checking, status mapping and the idempotent settle like every other.
    if (session.inlineCallback !== null) {
      await this.applyCallback(session.inlineCallback);
    }

    return { redirectUrl: session.redirectUrl };
  }

  /**
   * Charges everything that is due, and records what came of each.
   *
   * The whole of the renewal job, and deliberately a plain method: the worker
   * only calls it, so the rule is testable without Redis and `now` is an
   * argument rather than a fact about the machine.
   *
   * Returns how many were charged successfully, which is what the worker logs.
   */
  async renewDue(now = new Date()): Promise<number> {
    const due = await this.subscriptions.due(now);
    let renewed = 0;

    for (const subscription of due) {
      try {
        if (await this.renewOne(subscription, now)) {
          renewed += 1;
        }
      } catch (error: unknown) {
        // One subscription's bad day must not stop the rest of the run. The
        // attempt was claimed before any of this, so the schedule has already
        // advanced and the next run takes the NEXT attempt rather than
        // re-treading one it can no longer charge.
        this.logger.error(`Renewal failed for subscription ${subscription.id}: ${String(error)}`);
      }
    }

    // Anything whose retries are spent and whose access has run out is closed
    // here — the safety net for an attempt that was claimed and never reported
    // back, which would otherwise sit PAST_DUE for ever.
    await this.subscriptions.endLapsed(now);

    return renewed;
  }

  private async renewOne(subscription: SubscriptionWithTrainer, now: Date): Promise<boolean> {
    // The mandate is what a renewal charges against. Without one there is
    // nothing to charge and no point spending a dunning attempt on it.
    const mandate = subscription.recurrenceRef;

    if (mandate === null) {
      await this.subscriptions.withdraw(subscription);

      return false;
    }

    // Claimed BEFORE the money is touched. The attempt number and the next
    // attempt date are written first, in a compare-and-set only one caller
    // passes — so a crash, a provider timeout, a lost webhook or a second
    // worker cannot leave this row un-chargeable. Losing the claim means
    // somebody else has it, or a cancellation landed in between.
    const attempt = await this.subscriptions.claim(subscription, now);

    if (attempt === null) {
      return false;
    }

    const periodStart = subscription.currentPeriodEnd;
    // A cadence change asked for during the current period applies to THIS
    // renewal — the first period it was not too late to change. The price and
    // the snapshot both follow it, so the charge and the access granted for it
    // can never describe different arrangements.
    const period = subscription.pendingPeriod ?? subscription.period;
    const price = planPrice(subscription.plan, period);

    // Checked BEFORE this attempt's row is opened, so an attempt that must not
    // be made leaves nothing behind at all.
    if (await this.periodChargeOutstanding(subscription.id, periodStart)) {
      this.logger.warn(
        `An unresolved charge already exists for subscription ${subscription.id}; not charging`,
      );

      return false;
    }

    const payment = await this.createRenewalPayment(
      subscription,
      periodStart,
      attempt,
      price,
      period,
    );

    if (payment === null) {
      // The claim was won but this attempt's row already exists, which can only
      // be a duplicate run that got here first.
      return false;
    }

    try {
      const session = await this.provider.chargeRecurring({
        orderRef: payment.id,
        recurrenceRef: mandate,
        amount: price,
        description: `Gart ${subscription.plan}`,
        callbackUrl: `${this.apiOrigin}/payments/callback/${this.provider.id}`,
        metadata: { trainerId: subscription.trainerId },
      });

      await this.recordSession(payment.id, session);

      if (session.inlineCallback === null) {
        // The provider will answer by webhook. The claim already moved the
        // schedule on, so a lost answer costs one attempt instead of wedging
        // the subscription, and the FAILED webhook records itself through
        // settle().
        return false;
      }

      const settled = await this.applyCallback(session.inlineCallback);

      if (settled?.status === 'SUCCEEDED') {
        return true;
      }

      if (settled?.status === 'FAILED') {
        // Settling it already recorded the outcome against the subscription —
        // the same road a webhook takes. Recording it again here would dun the
        // trainer twice for one attempt.
        return false;
      }
    } catch (error: unknown) {
      this.logger.error(`Renewal charge failed for payment ${payment.id}: ${String(error)}`);

      // Closed rather than left PENDING. An abandoned row would sit in the
      // trainer's own history reading «в обробці» for ever, for a charge that
      // never happened.
      await this.prisma.payment
        .updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: { status: 'FAILED', failedAt: new Date(), providerStatus: 'charge-errored' },
        })
        .catch(() => undefined);
    }

    // Reached only when the charge produced no settlement at all: a throw, or a
    // callback the verification refused.
    await this.subscriptions.recordFailure(subscription.id, attempt);

    return false;
  }

  /**
   * Opens this attempt's payment, or reports that it already exists.
   *
   * `@@unique([subscriptionId, periodStart, periodAttempt])` is what makes a
   * re-run of the job a no-op rather than a second charge — and it is the
   * DATABASE that says so, so two workers racing the same due subscription
   * cannot both win. The attempt is in the key because a dunning RETRY is a
   * legitimate second charge for the same period.
   */
  private async createRenewalPayment(
    subscription: SubscriptionWithTrainer,
    periodStart: Date,
    attempt: number,
    price: { amount: string; currency: 'UAH' },
    period: SubscriptionPeriod,
  ): Promise<PaymentWithSubscription | null> {
    try {
      return await this.prisma.payment.create({
        data: {
          trainerId: subscription.trainerId,
          subscriptionId: subscription.id,
          periodStart,
          periodAttempt: attempt,
          amount: new Prisma.Decimal(price.amount),
          currency: price.currency,
          status: 'PENDING',
          provider: this.provider.id,
          description: `Gart ${subscription.plan}`,
          planSnapshot: subscription.plan,
          periodSnapshot: period,
        },
        include: { subscription: true },
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        this.logger.log(
          `Attempt ${String(attempt)} already made for subscription ${subscription.id}`,
        );

        return null;
      }

      throw error;
    }
  }

  /**
   * Whether an earlier charge for this period is paid, or acknowledged by the
   * acquirer and still unresolved.
   *
   * The case this exists for is the expensive one: `chargeRecurring` times out
   * AFTER the acquirer captured, or its webhook is lost. The schedule has
   * already advanced, so the next rung comes round and — with nothing looking —
   * charges the same period a second time. When the first answer finally lands,
   * both settle, and the trainer has paid twice for one month with no path to a
   * refund inside this system.
   *
   * A PENDING row only counts once a `providerRef` exists: that is the moment
   * the acquirer took the order and its outcome became unknown to us. A
   * genuinely DECLINED attempt is FAILED and does not block anything, so the
   * dunning ladder runs exactly as the policy describes.
   */
  private async periodChargeOutstanding(
    subscriptionId: string,
    periodStart: Date,
  ): Promise<boolean> {
    const outstanding = await this.prisma.payment.findFirst({
      where: {
        subscriptionId,
        periodStart,
        OR: [{ status: 'SUCCEEDED' }, { status: 'PENDING', providerRef: { not: null } }],
      },
      select: { id: true },
    });

    return outstanding !== null;
  }

  /** Binds the issued session to the payment, failing it closed if it cannot. */
  private async recordSession(
    paymentId: string,
    session: { providerRef: string; recurrenceRef?: string | null },
  ): Promise<PaymentWithSubscription> {
    try {
      return await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          providerRef: session.providerRef,
          // A hosted checkout has no mandate yet — the payer has not entered a
          // card. It arrives with the callback, and must not be nulled here.
          ...(session.recurrenceRef === undefined ? {} : { recurrenceRef: session.recurrenceRef }),
        },
        include: { subscription: true },
      });
    } catch (error: unknown) {
      await this.prisma.payment
        .update({
          where: { id: paymentId },
          data: { status: 'FAILED', failedAt: new Date(), providerStatus: 'session-unrecorded' },
        })
        .catch(() => undefined);

      this.logger.error(`Could not record the provider session for payment ${paymentId}`);

      throw error;
    }
  }

  /**
   * Applies a provider callback: verify, record, and settle exactly once.
   *
   * Returns null when there is nothing to apply — an unknown order, a stale
   * delivery, a replay. Never throws for a replay: a provider that receives an
   * error retries, and retrying a duplicate for ever is worse than accepting
   * it. Throws InvalidCallbackError only for a payload that does not verify.
   */
  async applyCallback(
    raw: RawCallback,
    provider?: string,
  ): Promise<PaymentWithSubscription | null> {
    // A callback addressed to an acquirer we are not running is not ours to
    // interpret. Letting the bound provider parse it anyway would mean a
    // payload for one signing scheme being checked against another's secret.
    if (provider !== undefined && provider !== this.provider.id) {
      throw new InvalidCallbackError('Callback was addressed to another provider');
    }

    const callback = await this.provider.parseCallback(raw);

    if (!this.isFresh(callback)) {
      this.logger.warn('Rejected a callback outside the freshness window');

      return null;
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: callback.orderRef },
      include: { subscription: true },
    });

    if (payment === null) {
      this.logger.warn('Rejected a callback for an unknown order');

      return null;
    }

    // The provider is not trusted about money. A callback claiming a different
    // amount than the one we recorded is either a bug or an attack, and in both
    // cases acting on it would be the wrong answer.
    if (!amountsEqual(payment.amount, callback.amount.amount)) {
      this.logger.error(`Callback amount did not match the stored payment: ${payment.id}`);

      return null;
    }

    if (callback.amount.currency !== payment.currency) {
      this.logger.error(`Callback currency did not match the stored payment: ${payment.id}`);

      return null;
    }

    const digest = payloadDigest(raw.body);

    // The fallback the interface documents. An adapter for a provider that
    // sends no per-delivery identifier can return an empty one, and the digest
    // stands in: a byte-identical retry still collides with its own first
    // attempt, while a genuinely different delivery gets its own row.
    const delivery = callback.externalId === '' ? digest : callback.externalId;

    const settled = await this.settle(payment, { ...callback, externalId: delivery }, digest);

    if (settled !== null && settled.status !== payment.status) {
      await this.announce(settled);
      await this.noteSubscriptionOutcome(settled);
    }

    return settled;
  }

  /** What this trainer has been charged, newest first. */
  async forTrainer(trainerId: string): Promise<PublicPayment[]> {
    const payments = await this.prisma.payment.findMany({
      where: { trainerId },
      include: { subscription: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return payments.map(toPublicPayment);
  }

  /**
   * Records the delivery and applies it — in one transaction, and at most once.
   *
   * Both guards live in the database rather than here. A check-then-write would
   * be correct only until two callbacks arrived at the same moment, which is
   * exactly what a retrying provider produces.
   */
  private async settle(
    payment: PaymentWithSubscription,
    callback: ProviderCallback,
    digest: string,
  ): Promise<PaymentWithSubscription | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // This delivery, recorded once. A replay collides here. Recorded even
        // for a status we go on to refuse, because «we received this and
        // declined to act on it» is the more useful audit trail.
        await tx.paymentEvent.create({
          data: {
            paymentId: payment.id,
            externalId: callback.externalId,
            status: callback.status,
            rawStatus: callback.rawStatus,
            payloadDigest: digest,
          },
        });

        // Our clock, not the provider's, for anything that decides duration.
        const observedAt = new Date();
        const reportedAt = callback.occurredAt ?? observedAt;

        // A compare-and-set, not a check-then-write: the status a transition is
        // allowed FROM is part of the WHERE clause, so two deliveries racing
        // each other cannot both win.
        const { count } = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: { in: [...ALLOWED_FROM[callback.status]] },
          },
          data: {
            status: callback.status,
            providerRef: callback.providerRef,
            providerStatus: callback.rawStatus,
            // Cleared as well as set: a payment that failed and then succeeded
            // on a second card must not keep a failedAt contradicting its paidAt.
            ...(callback.status === 'SUCCEEDED' ? { paidAt: reportedAt, failedAt: null } : {}),
            ...(callback.status === 'FAILED' ? { failedAt: reportedAt, paidAt: null } : {}),
            // The mandate a hosted checkout just established. Stored on the
            // payment too, not only on the subscription, so the row that
            // recorded the charge also records what it authorised.
            ...(callback.recurrenceRef === null ? {} : { recurrenceRef: callback.recurrenceRef }),
          },
        });

        if (count === 0) {
          this.logger.warn(`Ignored an out-of-order ${callback.status} for payment ${payment.id}`);

          return payment;
        }

        // Advanced in the SAME transaction that recorded the settlement, so a
        // charge taken and a subscription still owing cannot come apart.
        if (callback.status === 'SUCCEEDED' && payment.subscriptionId !== null) {
          await this.subscriptions.recordSuccess(
            tx,
            {
              subscriptionId: payment.subscriptionId,
              periodStart: payment.periodStart ?? observedAt,
              planSnapshot: payment.planSnapshot,
              periodSnapshot: payment.periodSnapshot,
              // The callback first: a hosted checkout's mandate arrives with
              // the settlement, and only a renewal already had one on the row.
              recurrenceRef: callback.recurrenceRef ?? payment.recurrenceRef,
              opening: payment.periodAttempt === OPENING_ATTEMPT,
            },
            observedAt,
          );
        }

        return tx.payment.findUniqueOrThrow({
          where: { id: payment.id },
          include: { subscription: true },
        });
      });
    } catch (error: unknown) {
      if (isIdempotencyCollision(error)) {
        this.logger.log(`Ignored a duplicate callback for payment ${payment.id}`);

        return null;
      }

      throw error;
    }
  }

  /**
   * Lets a payment's subscription hear how its charge went.
   *
   * A success is advanced inside settle's own transaction, so only the two
   * failing outcomes are handled here — and they must be, or the dunning ladder
   * would be unreachable for a provider that answers by webhook.
   */
  private async noteSubscriptionOutcome(payment: PaymentWithSubscription): Promise<void> {
    if (payment.subscriptionId === null) {
      return;
    }

    // Only a dunning attempt can fail its way down the ladder. A checkout the
    // trainer abandoned or a card they mistyped is not attempt one of anything:
    // there is no mandate yet, nothing is scheduled, and announcing «оплата не
    // пройшла — доступ до…» for it would threaten a trial that is in no danger.
    if (
      payment.status === 'FAILED' &&
      payment.periodAttempt !== null &&
      payment.periodAttempt !== OPENING_ATTEMPT
    ) {
      await this.subscriptions.recordFailure(payment.subscriptionId, payment.periodAttempt);

      return;
    }

    if (payment.status === 'REFUNDED') {
      // The money for this period went back, so the access it bought goes with
      // it, and nothing further is charged.
      await this.subscriptions.endAfterRefund(payment.subscriptionId, payment.periodStart);
    }
  }

  /** Tells the trainer what happened to their own charge. */
  private async announce(payment: PaymentWithSubscription): Promise<void> {
    if (payment.status !== 'REFUNDED') {
      // A success needs no announcement of its own — the subscription's state
      // is the news, and dunning speaks for a failure with the date attached.
      return;
    }

    this.logger.log(
      `Refunded ${formatMoney(toMoney(payment.amount, payment.currency))} on payment ${payment.id}`,
    );
  }

  /**
   * Whether a callback is recent enough to believe.
   *
   * Idempotency already makes a replay harmless. This refuses it anyway: a
   * payload captured today should not still be accepted next month merely
   * because its signature verifies. A provider that signs no timestamp reports
   * null and is exempt, because a timestamp outside the signature is one an
   * attacker can set.
   */
  private isFresh(callback: ProviderCallback): boolean {
    if (callback.occurredAt === null) {
      return true;
    }

    const age = Date.now() - callback.occurredAt.getTime();

    return age <= CALLBACK_MAX_AGE_MS && age >= -CALLBACK_MAX_SKEW_MS;
  }
}

export function toPublicPayment(payment: PaymentWithSubscription): PublicPayment {
  return {
    id: payment.id,
    // Null rather than a guess: reporting a ₴18 000 SCALE charge as PRO would
    // be worse than reporting that the plan is no longer known.
    plan: payment.subscription?.plan ?? null,
    amount: toMoney(payment.amount, payment.currency),
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
    paidAt: payment.paidAt === null ? null : payment.paidAt.toISOString(),
  };
}

/** A plain P2002, whatever the constraint — the renewal guard is only ever one. */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR
  );
}

/**
 * Whether a failure is the idempotency guard doing its job.
 *
 * Deliberately narrow. Two unique constraints can fire inside settle(), and
 * only one of them means «already applied»: PaymentEvent(paymentId,
 * externalId). The other — Payment(provider, providerRef) — fires when a
 * provider reuses a reference across payments, and treating THAT as a duplicate
 * would answer 204 to a genuine first delivery. It is rethrown.
 *
 * Discriminated on the model rather than on the constraint name because Prisma
 * 7's driver adapter reports no `meta.target`.
 */
function isIdempotencyCollision(error: unknown): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    (error as { code?: unknown }).code !== UNIQUE_CONSTRAINT_ERROR
  ) {
    return false;
  }

  return (error as { meta?: { modelName?: unknown } }).meta?.modelName === 'PaymentEvent';
}
