import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { CheckoutResult, PaymentStatus, PublicEntitlement, PublicPayment } from '@gart/shared';

import { ClientsService } from '../clients/clients.service';
import { PrismaService } from '../database/prisma.service';
import { requireEnv } from '../env';
import type { EntitlementModel, PaymentModel, ProductModel } from '../generated/prisma/models.js';
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
import { entitlementEnd } from './entitlement-window';
import { amountsEqual, toMoney } from './money';
import { payloadDigest } from './signature';

const PRODUCT_NOT_FOUND_MESSAGE = 'Продукт не знайдено';
const PRODUCT_INACTIVE_MESSAGE = 'Продукт більше не продається';
const PRODUCT_FREE_MESSAGE = 'Безкоштовний продукт не потребує оплати';
const UNIQUE_CONSTRAINT_ERROR = 'P2002';

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

type PaymentWithProduct = PaymentModel & { product: ProductModel };

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly provider: PaymentProvider,
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
        status: 'PENDING',
        provider: this.provider.id,
        description: product.name,
      },
      include: { product: true },
    });

    const session = await this.openCheckout(payment.id, {
      orderRef: payment.id,
      amount,
      description: product.name,
      payerEmail: client.email,
      returnUrl: `${this.webOrigin}/client`,
      callbackUrl: `${this.apiOrigin}/payments/callback/${this.provider.id}`,
      // Both arrive in Steps 24 and 25. The interface carries them now so that
      // adding a commission or a renewal is a change of argument, not of shape.
      split: null,
      recurrence: product.period === null ? null : { period: product.period, startsAt: null },
      metadata: { trainerId, clientId: client.id, productId: product.id },
    });

    const withRef = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: session.providerRef },
      include: { product: true },
    });

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
  async applyCallback(raw: RawCallback, provider?: string): Promise<PaymentWithProduct | null> {
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
      include: { product: true },
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

    return this.settle(payment, { ...callback, externalId: delivery }, digest);
  }

  async forClient(trainerId: string, clientId: string): Promise<PublicPayment[]> {
    const client = await this.clients.requireOwned(trainerId, clientId);

    const payments = await this.prisma.payment.findMany({
      where: { trainerId, clientId: client.id },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map(toPublicPayment);
  }

  async oneForTrainer(trainerId: string, paymentId: string): Promise<PublicPayment> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, trainerId },
      include: { product: true },
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
      include: { product: true },
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
    payment: PaymentWithProduct,
    callback: ProviderCallback,
    digest: string,
  ): Promise<PaymentWithProduct | null> {
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
              endsAt: entitlementEnd(observedAt, payment.product),
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
          include: { product: true },
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

export function toPublicPayment(payment: PaymentWithProduct): PublicPayment {
  return {
    id: payment.id,
    clientId: payment.clientId,
    productId: payment.productId,
    productName: payment.product.name,
    amount: toMoney(payment.amount, payment.currency),
    status: payment.status,
    description: payment.description,
    createdAt: payment.createdAt.toISOString(),
    paidAt: payment.paidAt === null ? null : payment.paidAt.toISOString(),
  };
}

export function toPublicEntitlement(
  entitlement: EntitlementModel & { product: ProductModel },
  now: Date,
): PublicEntitlement {
  const started = entitlement.startsAt.getTime() <= now.getTime();
  const notEnded = entitlement.endsAt === null || entitlement.endsAt.getTime() > now.getTime();

  return {
    id: entitlement.id,
    productId: entitlement.productId,
    productName: entitlement.product.name,
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
