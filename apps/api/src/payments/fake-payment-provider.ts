import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Money, PaymentStatus } from '@gart/shared';

import {
  type ChargeResult,
  type CheckoutSession,
  InvalidCallbackError,
  PaymentProvider,
  type ProviderCallback,
  type RawCallback,
  type RecurringChargeRequest,
  type SubscriptionCheckoutRequest,
  toCurrency,
} from './payment-provider';
import { sign, signaturesMatch } from './signature';

/**
 * What the next charge settles as. Narrower than PaymentStatus on purpose: a
 * charge cannot settle as already refunded, so REFUNDED is reachable only as a
 * later callback, which is exactly how a real reversal arrives.
 */
export type FakeOutcome = 'SUCCEEDED' | 'FAILED' | 'PENDING';

/** The fake's own status words, so the mapping step is genuinely exercised. */
const RAW_STATUS: Record<PaymentStatus, string> = {
  SUCCEEDED: 'success',
  FAILED: 'failure',
  PENDING: 'processing',
  REFUNDED: 'reversed',
};

const STATUS_BY_RAW: Record<string, PaymentStatus> = {
  success: 'SUCCEEDED',
  failure: 'FAILED',
  processing: 'PENDING',
  reversed: 'REFUNDED',
};

interface IssuedCharge {
  orderRef: string;
  providerRef: string;
  amount: Money;
  /** The mandate this charge establishes, for a checkout that opens one. */
  recurrenceRef: string | null;
}

/**
 * The in-memory payment provider: the binding for tests and for development,
 * and the reason the whole of Phase 3 can be built and tested without a bank.
 *
 * It is deliberately not a stub that returns SUCCEEDED. It mints a payload in
 * the same envelope a real acquirer uses — a base64 `data` blob with a detached
 * HMAC, which is LiqPay's actual shape — and hands it back as an inline
 * callback. The confirmation therefore travels the same road a real callback
 * will: verified, mapped, applied once. A stub that skipped that would leave
 * the only code that matters untested.
 *
 * The signing secret is generated per instance rather than configured. Nothing
 * outside the process needs it, so there is no secret to leak, and a test that
 * wants to prove verification works can sign a payload of its own.
 */
@Injectable()
export class FakePaymentProvider extends PaymentProvider {
  readonly id = 'fake';

  /** Per instance, per process. Never read from or written to the environment. */
  readonly secret = randomBytes(32).toString('hex');

  /** What the next checkout settles as. Tests reach for this to drive failures. */
  outcome: FakeOutcome = 'SUCCEEDED';

  /**
   * Makes the next charge fail outright, which is a different failure from a
   * charge the acquirer accepts and then declines: no reference, and nothing
   * for a callback to ever name.
   */
  unavailable = false;

  private readonly issued = new Map<string, IssuedCharge>();

  async parseCallback(raw: RawCallback): Promise<ProviderCallback> {
    const envelope = raw.body;

    if (envelope === null || typeof envelope !== 'object') {
      throw new InvalidCallbackError('Callback body was not an object');
    }

    const { data, signature } = envelope as Record<string, unknown>;

    if (typeof data !== 'string' || typeof signature !== 'string') {
      throw new InvalidCallbackError('Callback envelope was malformed');
    }

    // Verified BEFORE the payload is parsed, let alone believed. Anything
    // decoded from an unverified blob is attacker-controlled input.
    if (!signaturesMatch(signature, sign(data, this.secret))) {
      throw new InvalidCallbackError('Callback signature did not verify');
    }

    return this.decode(data);
  }

  /**
   * A hosted checkout that also establishes a mandate.
   *
   * The redirect URL is a real, distinguishable URL rather than a placeholder,
   * because the API hands it straight to the browser and a test that asserts
   * «we got somewhere to send the trainer» should be asserting something.
   *
   * The mandate is minted here but returned on the CALLBACK, exactly as an
   * acquirer does it — the payer has not entered a card at redirect time, so a
   * fake that returned a token immediately would let a bug survive where the
   * real integration has none.
   */
  async openSubscription(request: SubscriptionCheckoutRequest): Promise<CheckoutSession> {
    if (this.unavailable) {
      throw new Error('Fake acquirer is unavailable');
    }

    const providerRef = `fake_${randomUUID()}`;
    const recurrenceRef = `fake_mandate_${randomUUID()}`;

    this.issued.set(providerRef, {
      orderRef: request.orderRef,
      providerRef,
      amount: request.amount,
      recurrenceRef,
    });

    const outcome = this.outcome;

    return {
      providerRef,
      redirectUrl: `https://fake-acquirer.local/checkout/${providerRef}`,
      inlineCallback:
        outcome === 'PENDING'
          ? null
          : this.buildCallback(providerRef, outcome, request.amount, request.orderRef, {
              recurrenceRef,
            }),
    };
  }

  /**
   * A renewal: charged, not visited.
   *
   * Settles through the same envelope, signature and inline callback as a
   * webhook would, because a renewal that took a different road would leave the
   * road everything else takes untested for the case that runs unattended.
   */
  async chargeRecurring(request: RecurringChargeRequest): Promise<ChargeResult> {
    if (this.unavailable) {
      throw new Error('Fake acquirer is unavailable');
    }

    const providerRef = `fake_${randomUUID()}`;

    this.issued.set(providerRef, {
      orderRef: request.orderRef,
      providerRef,
      amount: request.amount,
      recurrenceRef: request.recurrenceRef,
    });

    const outcome = this.outcome;

    return {
      providerRef,
      // The mandate is unchanged by charging it.
      recurrenceRef: request.recurrenceRef,
      inlineCallback:
        outcome === 'PENDING'
          ? null
          : this.buildCallback(providerRef, outcome, request.amount, request.orderRef),
    };
  }

  async fetchStatus(providerRef: string): Promise<ProviderCallback> {
    const issued = this.issued.get(providerRef);

    if (issued === undefined) {
      throw new InvalidCallbackError('Unknown provider reference');
    }

    const callback = this.buildCallback(providerRef, this.outcome, issued.amount, issued.orderRef, {
      recurrenceRef: issued.recurrenceRef ?? undefined,
    });

    return this.parseCallback(callback);
  }

  /**
   * A signed callback exactly as this provider would deliver it.
   *
   * Public because tests need to post one, replay one, and tamper with one —
   * the three things a real acquirer's callbacks will eventually do to us.
   */
  buildCallback(
    providerRef: string,
    outcome: PaymentStatus,
    amount: Money,
    orderRef: string,
    overrides: Partial<{
      deliveryId: string;
      createdAt: Date;
      amount: string;
      recurrenceRef: string;
    }> = {},
  ): RawCallback {
    const payload = {
      order_id: orderRef,
      payment_id: providerRef,
      status: RAW_STATUS[outcome],
      amount: overrides.amount ?? amount.amount,
      currency: amount.currency,
      delivery_id: overrides.deliveryId ?? randomUUID(),
      created_at: (overrides.createdAt ?? new Date()).toISOString(),
      // Absent unless this callback establishes a mandate, which is how a real
      // acquirer's payload reads for an ordinary charge.
      ...(overrides.recurrenceRef === undefined ? {} : { recurrence_ref: overrides.recurrenceRef }),
    };

    const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

    return { body: { data, signature: sign(data, this.secret) }, headers: {} };
  }

  /** The last charge issued for an order, so a test can replay its callback. */
  issuedFor(orderRef: string): IssuedCharge | undefined {
    return [...this.issued.values()].find((checkout) => checkout.orderRef === orderRef);
  }

  private decode(data: string): ProviderCallback {
    const decoded: unknown = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));

    if (decoded === null || typeof decoded !== 'object') {
      throw new InvalidCallbackError('Callback payload was not an object');
    }

    const payload = decoded as Record<string, unknown>;
    const orderRef = payload.order_id;
    const providerRef = payload.payment_id;
    const rawStatus = payload.status;
    const amount = payload.amount;
    const currency = payload.currency;
    const deliveryId = payload.delivery_id;
    const createdAt = payload.created_at;
    const recurrenceRef = payload.recurrence_ref;

    if (
      typeof orderRef !== 'string' ||
      typeof providerRef !== 'string' ||
      typeof rawStatus !== 'string' ||
      typeof amount !== 'string' ||
      typeof currency !== 'string' ||
      typeof deliveryId !== 'string' ||
      typeof createdAt !== 'string'
    ) {
      throw new InvalidCallbackError('Callback payload was missing fields');
    }

    const status = STATUS_BY_RAW[rawStatus];
    const parsedCurrency = toCurrency(currency);
    const occurredAt = new Date(createdAt);

    if (recurrenceRef !== undefined && typeof recurrenceRef !== 'string') {
      throw new InvalidCallbackError('Callback payload was missing fields');
    }

    if (status === undefined || parsedCurrency === null || Number.isNaN(occurredAt.getTime())) {
      throw new InvalidCallbackError('Callback payload was not understood');
    }

    return {
      orderRef,
      providerRef,
      status,
      rawStatus,
      externalId: deliveryId,
      amount: { amount, currency: parsedCurrency },
      occurredAt,
      recurrenceRef: recurrenceRef ?? null,
    };
  }
}
