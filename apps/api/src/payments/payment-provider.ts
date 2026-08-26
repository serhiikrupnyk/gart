import type { Currency, Money, PaymentStatus } from '@gart/shared';

/**
 * How long after its own timestamp a callback is still believed.
 *
 * Idempotency already makes a replay harmless, but harmless is not the same as
 * refused: a payload captured today should not be accepted next month just
 * because its signature still verifies. Providers that sign no timestamp report
 * `occurredAt: null` and are exempt — the window is only meaningful when the
 * value it checks is covered by the signature.
 *
 * A day, and not the few minutes that first suggest themselves, because what
 * every acquirer signs is the EVENT time, not the delivery time: LiqPay's
 * `create_date`, Fondy's `order_time`, WayForPay's `processingDate`. A retry
 * carries the SAME timestamp as the attempt that failed — that is what makes it
 * a retry — and those chains run for hours. A short window would therefore have
 * fallen almost entirely on legitimate retries of payments we simply had not
 * received yet, while catching no replay that a day's window does not.
 */
export const CALLBACK_MAX_AGE_MS = 24 * 60 * 60_000;

/** Tolerance for a provider whose clock runs ahead of ours. */
export const CALLBACK_MAX_SKEW_MS = 60_000;

/**
 * Who a payment is for, sent so the acquirer's own dashboard and reconciliation
 * exports carry it.
 *
 * It deliberately does NOT come back: `ProviderCallback` has no metadata field,
 * because a callback names the order and the payer is then read from the row we
 * stored. Metadata that returned would be attacker-echoed, and the only safe
 * thing to do with it would be to ignore it.
 */
export interface PaymentMetadata {
  trainerId: string;
}

/**
 * A charge against an established mandate, with no payer present.
 *
 * The only kind of charge this system makes: a trainer's subscription renews
 * itself. Establishing the mandate in the first place is the subscribe flow's
 * job, and the verb for it arrives with that flow.
 */
export interface RecurringChargeRequest {
  /** Our new Payment's id, and the order reference the provider dedupes on. */
  orderRef: string;
  /** The mandate to charge, from whatever established it. */
  recurrenceRef: string;
  amount: Money;
  description: string;
  callbackUrl: string;
  metadata: PaymentMetadata;
}

/**
 * What the provider says about a charge it has just been asked to make.
 *
 * There is no hosted page and no payer present: the only charge this system
 * makes is a subscription renewing itself.
 */
export interface ChargeResult {
  /** The provider's own identifier for this payment. */
  providerRef: string;
  /**
   * The provider's handle on the mandate this charge used — a Fondy
   * `rectoken`, a WayForPay `recToken`. Kept so the next charge has something
   * to charge against.
   */
  recurrenceRef: string | null;
  /**
   * The result, when the provider settled synchronously instead of promising a
   * later callback.
   *
   * This is not a concession to the fake. It is how a provider that charges a
   * stored token behaves, and modelling it here is what lets the fake confirm
   * immediately WITHOUT a second code path: the settlement is fed through the
   * same `applyCallback` the webhook endpoint calls, so signature checking,
   * status mapping and the idempotent settle are exercised on the happy path
   * rather than only in whichever test remembers to post a webhook.
   *
   * Null means the answer will arrive by webhook.
   */
  inlineCallback: RawCallback | null;
}

/**
 * A callback exactly as it arrived. Body and headers both, because providers
 * disagree about where a signature lives: LiqPay signs a `data`/`signature`
 * body pair, WayForPay an HMAC over selected fields, and header-borne
 * signatures are common elsewhere.
 */
export interface RawCallback {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

/** A verified callback, in our vocabulary rather than the provider's. */
export interface ProviderCallback {
  /** The `orderRef` we supplied — our `Payment.id`. */
  orderRef: string;
  providerRef: string;
  status: PaymentStatus;
  /** The provider's own status word, kept for audit and support. */
  rawStatus: string;
  /**
   * The provider's identifier for THIS DELIVERY. Providers that supply none get
   * a digest of the canonical payload, so a byte-identical retry collides with
   * its own first attempt.
   */
  externalId: string;
  /** What the provider says it charged. Verified against the stored amount. */
  amount: Money;
  /**
   * When the provider says this happened, if the signature covers a timestamp.
   * Null exempts the provider from the freshness window.
   */
  occurredAt: Date | null;
}

/** Raised when a payload fails verification. Never carries provider detail. */
export class InvalidCallbackError extends Error {}

/**
 * The payment contract — and the DI token. Exactly the seam StorageService
 * established for object storage and NotificationQueue for the push queue: one
 * abstract class, a real binding, an in-memory fake for tests and dev.
 *
 * The shape is drawn from what a Ukrainian acquirer actually requires — a
 * signed callback to verify, a
 * merchant-owned order reference, and a status vocabulary of its own to map —
 * so LiqPay, Fondy or WayForPay can arrive later as a drop-in implementation
 * without a single caller changing.
 *
 * Nothing outside this folder may name a concrete provider. Callers ask
 * PaymentsService to take a payment.
 */
export abstract class PaymentProvider {
  /** Recorded on every Payment row, so reconciliation knows who to ask. */
  abstract readonly id: string;

  /**
   * Verifies the signature and translates the payload into our vocabulary.
   * Throws InvalidCallbackError on anything that does not verify — a caller
   * never sees a signature, and never decides what a valid one looks like.
   */
  abstract parseCallback(raw: RawCallback): Promise<ProviderCallback>;

  /**
   * Charges an established recurrence — a renewal.
   *
   * Returns the same session shape, so a renewal settles through the identical
   * road as everything else: verified, mapped, applied once. Fondy and
   * WayForPay charge a stored token exactly like this. LiqPay charges on its
   * own schedule instead, which an adapter expresses by returning PENDING with
   * no inline callback — the answer arrives later by webhook either way, and
   * nothing above this line has to know which model it is talking to.
   */
  abstract chargeRecurring(request: RecurringChargeRequest): Promise<ChargeResult>;

  /**
   * What the provider believes about a payment right now.
   *
   * Callbacks are lost in practice, and Step 25's dunning has to tell a genuine
   * failure from a delivery that never arrived. Every real integration grows
   * this method; declaring it now keeps that from being an interface change.
   */
  abstract fetchStatus(providerRef: string): Promise<ProviderCallback>;
}

/** Narrows an unknown currency string to the enum, or null. */
export function toCurrency(value: string): Currency | null {
  return value === 'UAH' ? value : null;
}
