import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { formatMoney } from '@gart/shared';
import type {
  CheckoutResult,
  ClientPayment,
  ClientPurchases,
  PaymentStatus,
  PaymentStatusFilter,
  PublicEntitlement,
  PublicPayment,
} from '@gart/shared';

import { ClientsService } from '../clients/clients.service';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../database/prisma.service';
import { requireEnv } from '../env';
import type {
  ClientModel,
  EntitlementModel,
  PaymentModel,
  ProductModel,
} from '../generated/prisma/models.js';
import {
  CALLBACK_MAX_AGE_MS,
  CALLBACK_MAX_SKEW_MS,
  type CheckoutRequest,
  type CheckoutSession,
  InvalidCallbackError,
  PaymentProvider,
  type ProviderCallback,
  type RawCallback,
} from './payment-provider';
import { commissionPercent, splitAmount } from './commission';
import { entitlementEnd } from './entitlement-window';
import { amountsEqual, toMoney } from '../common/money';
import { payloadDigest } from './signature';

const PRODUCT_NOT_FOUND_MESSAGE = 'Продукт не знайдено';
const ARCHIVED_CLIENT_MESSAGE = 'Клієнта архівовано — оплату виставити не можна';
const PRODUCT_INACTIVE_MESSAGE = 'Продукт більше не продається';
const PRODUCT_FREE_MESSAGE = 'Безкоштовний продукт не потребує оплати';
const UNIQUE_CONSTRAINT_ERROR = 'P2002';

/** Generous enough that a working trainer never meets it; Step 26 adds paging. */
const PAYMENT_LIST_LIMIT = 500;

/**
 * Which state a payment must already be in for an arriving status to apply.
 *
 * Acquirers do not promise ordered delivery, and they retry. Without this, a
 * `processing` delivery emitted before a `success` one but retried after it
 * would walk a paid payment back to PENDING — leaving a row with a non-null
 * `paidAt`, a live entitlement, and a status that says the money is still in
 * flight. A refund is the one move allowed out of SUCCEEDED; nothing moves out
 * of FAILED or REFUNDED, because a second attempt is a second payment.
 */
const ALLOWED_FROM: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ['PENDING'],
  // From FAILED too, and this is the case that matters: the order reference we
  // hand the acquirer IS this payment's id, so a payer whose first card is
  // declined and who immediately tries another one on the same hosted page
  // produces a success for the SAME order. Treating FAILED as terminal would
  // take their money and grant nothing.
  SUCCEEDED: ['PENDING', 'FAILED'],
  FAILED: ['PENDING'],
  // From PENDING too, so a refund cannot be overtaken by the success delivery
  // it followed. If the success was lost and the reversal arrives first, this
  // records the refund and — because nothing is allowed out of REFUNDED — stops
  // the late success from granting access to money that has gone back.
  REFUNDED: ['SUCCEEDED', 'PENDING'],
};

type PaymentWithParties = PaymentModel & { product: ProductModel; client: ClientModel };

/**
 * Taking money, and granting what it bought.
 *
 * Every read is scoped `{ trainerId, clientId }` — the refinement Step 16
 * settled, and money is the last place to relax it: a sibling client of the
 * same trainer must be as far away as a stranger.
 *
 * The service never learns which acquirer is behind PaymentProvider. It hands
 * over an order reference and an amount, and is handed back a verified result
 * in its own vocabulary.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  /**
   * Read once, at construction. WEB_ORIGIN is validated when security is
   * configured; API_ORIGIN had no such moment, so an environment missing it
   * would boot cleanly, pass its health check, and fail on the first sale.
   */
  private readonly apiOrigin = requireEnv('API_ORIGIN');
  private readonly webOrigin = requireEnv('WEB_ORIGIN');

  /**
   * Read once, at construction, so a nonsensical rate stops the boot rather
   * than dividing somebody's money by surprise on the first sale.
   */
  private readonly commission = commissionPercent(process.env);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly provider: PaymentProvider,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Opens a checkout for one of this trainer's clients.
   *
   * The amount comes from the stored product and from nowhere else. That is the
   * whole reason `Product` exists this early: a price that travelled in the
   * request would be a price the payer could choose.
   */
  async createCheckout(
    trainerId: string,
    clientId: string,
    productId: string,
  ): Promise<CheckoutResult> {
    const client = await this.clients.requireOwned(trainerId, clientId);

    // requireOwned answers «is this yours», not «is this still active». An
    // archived client cannot sign in, so a checkout aimed at one produces a
    // hosted page nobody can reach, an entitlement nobody can use and a
    // notification nobody can read — while the trainer's payments list shows a
    // sale. Assignments refuse the lighter write for the same reason.
    if (client.status === 'ARCHIVED') {
      throw new BadRequestException(ARCHIVED_CLIENT_MESSAGE);
    }

    const product = await this.requireProduct(trainerId, productId);

    if (!product.isActive) {
      throw new BadRequestException(PRODUCT_INACTIVE_MESSAGE);
    }

    // Refused at the door rather than left to fail quietly later: a zero amount
    // is not one a callback can ever confirm (parseAmount requires a positive
    // value), so a free product would open a checkout that could only ever end
    // in a payment stuck at PENDING and a 204 the provider never retries.
    if (!product.priceAmount.greaterThan(0)) {
      throw new BadRequestException(PRODUCT_FREE_MESSAGE);
    }

    const amount = toMoney(product.priceAmount, product.currency);

    // Computed here and stored, never recomputed on read. A rate change applies
    // to the next checkout and rewrites nothing that has already been charged —
    // the same argument as the amount and the grant terms beside it.
    const { fee } = splitAmount(product.priceAmount, this.commission);

    // Created PENDING first, so the row that the provider's callback will name
    // already exists. A provider fast enough to call back before we had written
    // it would otherwise arrive at a payment we have never heard of.
    const payment = await this.prisma.payment.create({
      data: {
        trainerId,
        clientId: client.id,
        productId: product.id,
        amount: product.priceAmount,
        currency: product.currency,
        platformFee: fee,
        status: 'PENDING',
        provider: this.provider.id,
        description: product.name,
        // Frozen with the price: what was bought includes how long it lasts.
        periodSnapshot: product.period,
        accessDaysSnapshot: product.accessDays,
      },
      include: { product: true, client: true },
    });

    const session = await this.openCheckout(payment.id, {
      orderRef: payment.id,
      amount,
      description: product.name,
      payerEmail: client.email,
      returnUrl: `${this.webOrigin}/client`,
      callbackUrl: `${this.apiOrigin}/payments/callback/${this.provider.id}`,
      // The Step 22 interface carried this shape from the start, so populating
      // it is a change of argument and nothing else — which is the whole claim
      // that seam was making.
      //
      // `beneficiaryRef` is documented as the acquirer-side account of the
      // trainer, and until an acquirer exists no such account does. The
      // platform's own reference for them is sent instead; the adapter that
      // lands with a real provider maps it to that provider's account id, which
      // is precisely the translation an adapter exists to do.
      split: { beneficiaryRef: trainerId, platformFee: toMoney(fee, product.currency) },
      recurrence: product.period === null ? null : { period: product.period, startsAt: null },
      metadata: { trainerId, clientId: client.id, productId: product.id },
    });

    // Inside the same compensation as the call that produced the session: a
    // failure here would leave a payment PENDING with no reference — nothing
    // for fetchStatus to ask about and nothing for the client to open — while
    // a live hosted page sits at the acquirer waiting to be paid.
    const withRef = await this.recordSession(payment.id, session);

    // A provider that settled synchronously reports through the SAME path a
    // webhook would take. There is exactly one place a payment can succeed.
    const settled =
      session.inlineCallback === null ? null : await this.applyCallback(session.inlineCallback);

    // applyCallback resolves its row from the orderRef the ADAPTER handed back,
    // and this is the only place a tenant-scoped caller reads that result. An
    // adapter that named a different payment would otherwise serialise another
    // trainer's row straight back to this one. We already refuse to trust a
    // provider about the amount; this is the same refusal about the identity.
    if (settled !== null && settled.id !== payment.id) {
      this.logger.error(`Provider settled a payment we did not open: ${payment.id}`);

      return { payment: toPublicPayment(withRef), redirectUrl: session.redirectUrl };
    }

    return { payment: toPublicPayment(settled ?? withRef), redirectUrl: session.redirectUrl };
  }

  /** Binds the issued session to the payment, failing it closed if it cannot. */
  private async recordSession(
    paymentId: string,
    session: CheckoutSession,
  ): Promise<PaymentWithParties> {
    try {
      return await this.prisma.payment.update({
        where: { id: paymentId },
        data: { providerRef: session.providerRef, checkoutUrl: session.redirectUrl },
        include: { product: true, client: true },
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
   * Tells both parties what happened, through the one notification door.
   *
   * Best effort by NotificationService's own design — a missing notification is
   * a nuisance, and a payment that succeeded must not be un-succeeded because a
   * push could not be delivered.
   */
  private async announce(payment: PaymentWithParties): Promise<void> {
    if (payment.status === 'SUCCEEDED') {
      await Promise.all([
        this.notifications.notifyTrainer({
          trainerId: payment.trainerId,
          clientId: payment.clientId,
          type: 'PAYMENT_SUCCEEDED',
          detail: `${payment.description} · ${formatMoney(toMoney(payment.amount, payment.currency))}`,
        }),
        this.notifications.notifyClient({
          trainerId: payment.trainerId,
          clientId: payment.clientId,
          type: 'PAYMENT_SUCCEEDED',
          title: 'Оплату отримано',
          // The client is told what they bought and what they paid. What the
          // platform took is a term between the platform and their trainer.
          body: `${payment.description} — доступ відкрито`,
        }),
      ]);

      return;
    }

    if (payment.status === 'FAILED') {
      await Promise.all([
        this.notifications.notifyTrainer({
          trainerId: payment.trainerId,
          clientId: payment.clientId,
          type: 'PAYMENT_FAILED',
          detail: payment.description,
        }),
        this.notifications.notifyClient({
          trainerId: payment.trainerId,
          clientId: payment.clientId,
          type: 'PAYMENT_FAILED',
          title: 'Оплата не пройшла',
          body: `${payment.description} — спробуйте ще раз`,
        }),
      ]);
    }

    if (payment.status === 'REFUNDED') {
      // The refund already revoked the entitlement, so the client's access has
      // just ended. Telling them is not Step 26's receipt — it is the reason
      // the app they opened no longer has what they bought in it.
      await Promise.all([
        this.notifications.notifyTrainer({
          trainerId: payment.trainerId,
          clientId: payment.clientId,
          type: 'PAYMENT_REFUNDED',
          detail: `${payment.description} · ${formatMoney(toMoney(payment.amount, payment.currency))}`,
        }),
        this.notifications.notifyClient({
          trainerId: payment.trainerId,
          clientId: payment.clientId,
          type: 'PAYMENT_REFUNDED',
          title: 'Кошти повернуто',
          body: `${payment.description} — доступ закрито`,
        }),
      ]);
    }

    // PENDING announces nothing: «we are still waiting» is not news.
  }

  /**
   * Asks the provider to open a checkout, and cleans up if it cannot.
   *
   * The Payment row has to be committed first — a provider fast enough to call
   * back before we had written it would otherwise arrive at an order we have
   * never heard of. The cost is that a provider which times out leaves a row
   * behind, and a PENDING payment with no provider reference is one nothing can
   * ever resolve: `fetchStatus` has nothing to ask about. So it is marked
   * FAILED on the way out, which is what actually happened — no checkout was
   * ever opened — and the trainer sees a payment they can retry rather than one
   * stuck in «В обробці» for ever.
   */
  private async openCheckout(
    paymentId: string,
    request: CheckoutRequest,
  ): Promise<CheckoutSession> {
    try {
      return await this.provider.createCheckout(request);
    } catch (error: unknown) {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'FAILED', failedAt: new Date(), providerStatus: 'checkout-unavailable' },
      });

      this.logger.error(`Provider could not open a checkout for payment ${paymentId}`);

      throw error;
    }
  }

  /**
   * Applies a provider callback: verify, record, and grant exactly once.
   *
   * Returns null when there is nothing to apply — an unknown order, a stale
   * delivery, a replay. Never throws for a replay: a provider that receives an
   * error retries, and retrying a duplicate forever is worse than accepting it.
   * Throws InvalidCallbackError only for a payload that does not verify.
   */
  async applyCallback(raw: RawCallback, provider?: string): Promise<PaymentWithParties | null> {
    // A callback addressed to an acquirer we are not running is not ours to
    // interpret. Letting the bound provider parse it anyway would mean a
    // payload for one signing scheme being checked against another's secret.
    if (provider !== undefined && provider !== this.provider.id) {
      throw new InvalidCallbackError('Callback was addressed to another provider');
    }

    const callback = await this.provider.parseCallback(raw);

    if (!this.isFresh(callback)) {
      this.logger.warn(`Rejected a callback outside the freshness window: ${callback.orderRef}`);

      return null;
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: callback.orderRef },
      include: { product: true, client: true },
    });

    if (payment === null) {
      this.logger.warn('Rejected a callback for an unknown order');

      return null;
    }

    // The provider is not trusted about money. A callback claiming a different
    // amount than the one we recorded is either a bug or an attack, and in both
    // cases granting access on it would be the wrong answer.
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

    // Only a delivery that changed something announces itself. settle() returns
    // null for a duplicate, so a retrying provider cannot notify twice — and an
    // out-of-order delivery it refused returns the row unchanged, which the
    // status comparison below filters out.
    if (settled !== null && settled.status !== payment.status) {
      await this.announce(settled);
    }

    return settled;
  }

  async forClient(trainerId: string, clientId: string): Promise<PublicPayment[]> {
    const client = await this.clients.requireOwned(trainerId, clientId);

    const payments = await this.prisma.payment.findMany({
      where: { trainerId, clientId: client.id },
      include: { product: true, client: true },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map(toPublicPayment);
  }

  /**
   * Every payment this trainer has taken, newest first.
   *
   * Unpaged like the catalogue, and for a weaker reason — a payment list only
   * grows. Bounded here rather than left open: the cap is generous enough that
   * a working trainer never meets it, and Step 26's transaction history is
   * where paging and export belong.
   */
  async forTrainer(trainerId: string, status: PaymentStatusFilter): Promise<PublicPayment[]> {
    const payments = await this.prisma.payment.findMany({
      where: { trainerId, ...(status === 'all' ? {} : { status }) },
      include: { product: true, client: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAYMENT_LIST_LIMIT,
    });

    return payments.map(toPublicPayment);
  }

  /** What the client owes, and what they own. Their own rows only. */
  async purchasesForClient(
    trainerId: string,
    clientId: string,
    now: Date,
  ): Promise<ClientPurchases> {
    const [payments, entitlements] = await Promise.all([
      this.prisma.payment.findMany({
        where: { trainerId, clientId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAYMENT_LIST_LIMIT,
      }),
      this.prisma.entitlement.findMany({
        where: { trainerId, clientId },
        include: { product: true, payment: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      payments: payments.map(toClientPayment),
      entitlements: entitlements.map((entitlement) => toPublicEntitlement(entitlement, now)),
    };
  }

  async oneForTrainer(trainerId: string, paymentId: string): Promise<PublicPayment> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, trainerId },
      include: { product: true, client: true },
    });

    if (payment === null) {
      throw new NotFoundException();
    }

    return toPublicPayment(payment);
  }

  /**
   * What this client has been granted, newest first. Their own rows only.
   *
   * Scoped by the pair even though `clientId` alone already identifies exactly
   * one client of exactly one trainer: the safety of a query should be legible
   * in its `where` clause rather than resting on a foreign key three models
   * away, and this file claims the pair as its invariant.
   */
  async entitlementsForClient(
    trainerId: string,
    clientId: string,
    now: Date,
  ): Promise<PublicEntitlement[]> {
    const entitlements = await this.prisma.entitlement.findMany({
      where: { trainerId, clientId },
      include: { product: true, payment: true },
      orderBy: { createdAt: 'desc' },
    });

    return entitlements.map((entitlement) => toPublicEntitlement(entitlement, now));
  }

  /**
   * Records the delivery and, if it succeeded, grants access — in one
   * transaction, and at most once.
   *
   * Both guards live in the database rather than here. A check-then-write in
   * this method would be correct only until two callbacks arrived at the same
   * moment, which is exactly what a retrying provider produces.
   */
  private async settle(
    payment: PaymentWithParties,
    callback: ProviderCallback,
    digest: string,
  ): Promise<PaymentWithParties | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Guard one: this delivery, recorded once. A replay collides here.
        // Recorded even for a status we go on to refuse, because "we received
        // this and declined to act on it" is the more useful audit trail.
        await tx.paymentEvent.create({
          data: {
            paymentId: payment.id,
            externalId: callback.externalId,
            status: callback.status,
            rawStatus: callback.rawStatus,
            payloadDigest: digest,
          },
        });

        // Our clock, not the provider's. `occurredAt` is bounded to a few
        // minutes either side of now, which sounds harmless until a monthly
        // subscription settles minutes before a month boundary: anchoring
        // addMonths to 28 February instead of 1 March costs the client three
        // days. The provider's timestamp stays on paidAt, where it belongs for
        // reconciliation, and never decides how long access lasts.
        const observedAt = new Date();
        const reportedAt = callback.occurredAt ?? observedAt;

        // A compare-and-set, not a check-then-write: the status a transition is
        // allowed FROM is part of the WHERE clause, so two deliveries racing
        // each other cannot both win. A row count of zero means the payment had
        // already moved on, which is the out-of-order case.
        const { count } = await tx.payment.updateMany({
          where: { id: payment.id, status: { in: [...ALLOWED_FROM[callback.status]] } },
          data: {
            status: callback.status,
            providerRef: callback.providerRef,
            providerStatus: callback.rawStatus,
            // Cleared as well as set: a payment that failed and then succeeded
            // on a second card must not keep a failedAt contradicting its paidAt.
            ...(callback.status === 'SUCCEEDED' ? { paidAt: reportedAt, failedAt: null } : {}),
            ...(callback.status === 'FAILED' ? { failedAt: reportedAt, paidAt: null } : {}),
            // A settled payment has no page left to pay on. Cleared here rather
            // than merely hidden by the UI, so «is this payable» is one fact in
            // the row instead of a rule two screens have to remember.
            ...(callback.status === 'PENDING' ? {} : { checkoutUrl: null }),
          },
        });

        if (count === 0) {
          this.logger.warn(`Ignored an out-of-order ${callback.status} for payment ${payment.id}`);

          return payment;
        }

        if (callback.status === 'SUCCEEDED') {
          // Guard two, and the stronger one: Entitlement.paymentId is unique,
          // so access can be granted at most once per payment BECAUSE THE
          // DATABASE SAYS SO — even for two deliveries carrying different ids.
          await tx.entitlement.create({
            data: {
              trainerId: payment.trainerId,
              clientId: payment.clientId,
              productId: payment.productId,
              paymentId: payment.id,
              startsAt: observedAt,
              endsAt: entitlementEnd(observedAt, {
                // The terms this payment was BOUGHT under, not the ones the
                // catalogue carries now. Backfilled by the migration that added
                // them, so every payment has a snapshot and nothing guesses.
                period: payment.periodSnapshot,
                accessDays: payment.accessDaysSnapshot,
              }),
            },
          });
        }

        if (callback.status === 'REFUNDED') {
          // Money going back has to take the access with it. `revokedAt` is
          // what toPublicEntitlement reads, and leaving it unwritten would mean
          // a refunded client keeping everything they bought until it lapsed.
          await tx.entitlement.updateMany({
            where: { paymentId: payment.id, revokedAt: null },
            data: { revokedAt: observedAt },
          });
        }

        return tx.payment.findUniqueOrThrow({
          where: { id: payment.id },
          include: { product: true, client: true },
        });
      });
    } catch (error: unknown) {
      if (isIdempotencyCollision(error)) {
        // Already applied. The provider is told everything is fine, because it
        // is: the first delivery did the work and the second changed nothing.
        this.logger.log(`Ignored a duplicate callback for payment ${payment.id}`);

        return null;
      }

      throw error;
    }
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

  private async requireProduct(trainerId: string, productId: string): Promise<ProductModel> {
    const product = await this.prisma.product.findFirst({ where: { id: productId, trainerId } });

    if (product === null) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_MESSAGE);
    }

    return product;
  }
}

export function toPublicPayment(payment: PaymentWithParties): PublicPayment {
  return {
    id: payment.id,
    clientId: payment.clientId,
    clientName: payment.client.fullName,
    productId: payment.productId,
    // The name at PURCHASE, not the one the catalogue carries now: a rename
    // must not rewrite what a completed payment says it bought.
    productName: payment.description,
    amount: toMoney(payment.amount, payment.currency),
    platformFee: toMoney(payment.platformFee, payment.currency),
    // Derived by subtraction from the two stored values, so it can never
    // disagree with them — and never rounded a second time.
    payout: toMoney(payment.amount.minus(payment.platformFee), payment.currency),
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
    paidAt: payment.paidAt === null ? null : payment.paidAt.toISOString(),
    checkoutUrl: payment.checkoutUrl,
  };
}

/**
 * The same row, as the client is allowed to see it.
 *
 * There is no fee and no payout here, and the type it returns has nowhere to
 * put them — omission the compiler enforces rather than omission somebody has
 * to remember.
 */
export function toClientPayment(payment: PaymentModel): ClientPayment {
  return {
    id: payment.id,
    productName: payment.description,
    amount: toMoney(payment.amount, payment.currency),
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
    paidAt: payment.paidAt === null ? null : payment.paidAt.toISOString(),
    checkoutUrl: payment.checkoutUrl,
  };
}

export function toPublicEntitlement(
  entitlement: EntitlementModel & { product: ProductModel; payment: PaymentModel },
  now: Date,
): PublicEntitlement {
  const started = entitlement.startsAt.getTime() <= now.getTime();
  const notEnded = entitlement.endsAt === null || entitlement.endsAt.getTime() > now.getTime();

  return {
    id: entitlement.id,
    productId: entitlement.productId,
    // Same snapshot, for the same reason — and this one is what the CLIENT sees
    // for the thing they bought.
    productName: entitlement.payment.description,
    startsAt: entitlement.startsAt.toISOString(),
    endsAt: entitlement.endsAt === null ? null : entitlement.endsAt.toISOString(),
    isActive: entitlement.revokedAt === null && started && notEnded,
  };
}

/**
 * Whether a failure is one of the two idempotency guards doing its job.
 *
 * Deliberately narrow. Three unique constraints can fire inside settle(), and
 * only two of them mean "already applied": PaymentEvent(paymentId, externalId)
 * and Entitlement.paymentId. The third — Payment(provider, providerRef) — fires
 * when a provider reuses a reference across payments, and treating THAT as a
 * duplicate would answer 204 to a genuine first delivery, stopping the retries,
 * leaving the client paid-for-nothing and the log claiming a duplicate. It is
 * rethrown, so the provider gets a 500 and tries again.
 *
 * Discriminated on the model rather than on the constraint name because Prisma
 * 7's driver adapter reports no `meta.target`: it nests the constraint under
 * `driverAdapterError.cause`, with the field names still carrying their SQL
 * quotes. `modelName` is the stable part, and it says what we actually mean.
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

  const model = (error as { meta?: { modelName?: unknown } }).meta?.modelName;

  return model === 'PaymentEvent' || model === 'Entitlement';
}
