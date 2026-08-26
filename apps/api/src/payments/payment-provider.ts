import type { Currency, Money, PaymentStatus, SubscriptionPeriod } from '@gart/shared';

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
 * Who and what a payment is for, sent so the acquirer's own dashboard and
 * reconciliation exports carry it.
 *
 * It deliberately does NOT come back: `ProviderCallback` has no metadata field,
 * because a callback names the order and the tenant is then read from the row
 * we stored. Metadata that returned would be attacker-echoed, and the only safe
 * thing to do with it would be to ignore it.
 */
export interface PaymentMetadata {
  trainerId: string;
  clientId: string;
  productId: string;
}

/**
 * How the money divides. Named for what each party gets rather than for any one
 * acquirer's field names: LiqPay expresses this as `split_rules`, Fondy as
 * settlement parameters, WayForPay as a separate settlement call.
 *
 * Step 24 populates it. The shape exists now so adding the split later changes
 * an argument's value, not the interface every caller is written against.
 */
export interface SplitInstruction {
  /** The acquirer-side account of the trainer who receives the balance. */
  beneficiaryRef: string;
  /** The platform's cut, taken from the total rather than added to it. */
  platformFee: Money;
}

/**
 * A recurring charge. Every candidate acquirer wants this declared when the
 * first payment is created, not afterwards, which is why it belongs here.
 */
export interface RecurrenceInstruction {
  period: SubscriptionPeriod;
  /** When the second charge is due. Null lets the provider decide from `period`. */
  startsAt: Date | null;
}

/**
 * A charge against an established mandate, with no payer present.
 *
 * Deliberately not `createCheckout`: that returns a hosted page for somebody to
 * visit, and a renewal has nobody to visit it. Everything else is the same
 * shape, including the split — a renewal is commissioned exactly as the first
 * payment was, at whatever the rate is when it runs.
 */
export interface RecurringChargeRequest {
  /** Our new Payment's id, and the order reference the provider dedupes on. */
  orderRef: string;
  /** The mandate to charge, from the checkout that established it. */
  recurrenceRef: string;
  amount: Money;
  description: string;
  callbackUrl: string;
  split: SplitInstruction | null;
  metadata: PaymentMetadata;
}

export interface CheckoutRequest {
  /**
   * Our `Payment.id`. Every candidate acquirer requires a merchant-owned unique
   * order reference, so the primary key serves as one and the provider ends up
   * deduplicating on exactly the value we deduplicate on.
   */
  orderRef: string;
  amount: Money;
  /** Shown to the payer on the hosted page; Ukrainian. */
  description: string;
  payerEmail: string | null;
  /** Where the browser returns after the hosted page is done. */
  returnUrl: string;
  /** Where the provider POSTs its signed result. */
  callbackUrl: string;
  split: SplitInstruction | null;
  recurrence: RecurrenceInstruction | null;
  metadata: PaymentMetadata;
}

export interface CheckoutSession {
  /** The provider's own identifier for this payment. */
  providerRef: string;
  /**
   * The provider's handle on an established mandate, when this payment created
   * one — a Fondy `rectoken`, a WayForPay `recToken`, a LiqPay subscription.
   * Null when the payment set up no recurrence. Kept so a later charge has
   * something to charge against.
   */
  recurrenceRef: string | null;
  /**
   * The hosted page to send the payer to. Null when the provider settled
   * without one — see `inlineCallback`.
   */
  redirectUrl: string | null;
  status: PaymentStatus;
  /**
   * The result, when the provider settled synchronously instead of promising a
   * later callback.
   *
   * This is not a concession to the fake. It is how a provider that charges a
   * stored token behaves, and modelling it here is what lets the fake confirm
   * immediately WITHOUT a second code path: the settlement is fed through the
   * same `applyCallback` the webhook endpoint calls, so signature checking,
   * status mapping and the idempotent grant are exercised on the happy path
   * rather than only in whichever test remembers to post a webhook.
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
 * hosted checkout page to redirect to, a signed callback to verify, a
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

  abstract createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;

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
  abstract chargeRecurring(request: RecurringChargeRequest): Promise<CheckoutSession>;

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
