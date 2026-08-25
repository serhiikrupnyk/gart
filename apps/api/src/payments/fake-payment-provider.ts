import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Money, PaymentStatus } from '@gart/shared';

import {
  type CheckoutRequest,
  type CheckoutSession,
  InvalidCallbackError,
  PaymentProvider,
  type ProviderCallback,
  type RawCallback,
  type RecurrenceInstruction,
  type SplitInstruction,
  toCurrency,
} from './payment-provider';
import { sign, signaturesMatch } from './signature';

/**
 * What the next checkout settles as. Narrower than PaymentStatus on purpose: a
 * checkout cannot open already refunded, so REFUNDED is reachable only as a
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

interface IssuedCheckout {
  orderRef: string;
  providerRef: string;
  amount: Money;
  /** Exactly what the caller instructed, kept so tests can assert it arrived. */
  split: SplitInstruction | null;
  recurrence: RecurrenceInstruction | null;
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
   * Makes the next checkout fail to open at all, which is a different failure
   * from a payment that opens and then declines: no hosted page, no reference,
   * nothing for a callback to ever name.
   */
  unavailable = false;

  private readonly issued = new Map<string, IssuedCheckout>();

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    if (this.unavailable) {
      throw new Error('Fake acquirer is unavailable');
    }

    const providerRef = `fake_${randomUUID()}`;

    this.issued.set(providerRef, {
      orderRef: request.orderRef,
      providerRef,
      amount: request.amount,
      split: request.split,
      recurrence: request.recurrence,
    });

    const outcome = this.outcome;

    return {
      providerRef,
      // A hosted page the payer would visit. Nothing serves it: the settlement
      // has already been decided, and the URL exists so callers handle a
      // redirect the same way they will when a real page is behind it.
      redirectUrl: `https://fake-checkout.invalid/${providerRef}`,
      status: outcome,
      // PENDING means the provider is still thinking, so it reports nothing
      // yet — exactly the case where a later webhook is the only news.
      inlineCallback:
        outcome === 'PENDING'
          ? null
          : this.buildCallback(providerRef, outcome, request.amount, request.orderRef),
    };
  }

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

  async fetchStatus(providerRef: string): Promise<ProviderCallback> {
    const issued = this.issued.get(providerRef);

    if (issued === undefined) {
      throw new InvalidCallbackError('Unknown provider reference');
    }

    const callback = this.buildCallback(providerRef, this.outcome, issued.amount, issued.orderRef);

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
    overrides: Partial<{ deliveryId: string; createdAt: Date; amount: string }> = {},
  ): RawCallback {
    const payload = {
      order_id: orderRef,
      payment_id: providerRef,
      status: RAW_STATUS[outcome],
      amount: overrides.amount ?? amount.amount,
      currency: amount.currency,
      delivery_id: overrides.deliveryId ?? randomUUID(),
      created_at: (overrides.createdAt ?? new Date()).toISOString(),
    };

    const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

    return { body: { data, signature: sign(data, this.secret) }, headers: {} };
  }

  /** The last checkout issued for an order, so a test can replay its callback. */
  issuedFor(orderRef: string): IssuedCheckout | undefined {
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
    };
  }
}
