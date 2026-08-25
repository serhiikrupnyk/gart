/**
 * Money crosses the wire as a decimal STRING, never a number.
 *
 * The rest of the app converts Prisma's Decimal with `Number(...)` — fine for a
 * habit target at 8,2, where a chart is the only consumer. Money is different:
 * `0.1 + 0.2` is the oldest bug in billing, and a float that has been through
 * JSON has already lost the argument. The string is exact, and every arithmetic
 * step happens server-side in Decimal.
 */
export interface Money {
  amount: string;
  currency: Currency;
}

/** Only UAH today; the enum exists so a second currency is additive. */
export type Currency = 'UAH';

/** What a trainer sells: one-time access, or a recurring subscription. */
export type ProductKind = 'ONE_TIME' | 'SUBSCRIPTION';

/** The roadmap's own subscription vocabulary, fixed here so Step 25 inherits it. */
export type SubscriptionPeriod = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

/**
 * Periods are counted in MONTHS, not days: a subscription bought on the 31st
 * should renew on a month boundary rather than drift by several days a year.
 */
export const SUBSCRIPTION_PERIOD_MONTHS: Record<SubscriptionPeriod, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

/**
 * The canonical payment lifecycle. Every provider's own vocabulary maps onto
 * exactly these four before it reaches anything outside the provider adapter.
 */
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';

export interface PublicPayment {
  id: string;
  clientId: string;
  productId: string;
  productName: string;
  amount: Money;
  status: PaymentStatus;
  description: string;
  createdAt: string;
  paidAt: string | null;
}

/** What creating a checkout hands back to the trainer. */
export interface CheckoutResult {
  payment: PublicPayment;
  /**
   * Where the payer must be sent to pay. Null when the provider settled inline
   * and there is no hosted page to visit.
   */
  redirectUrl: string | null;
}

export interface PublicEntitlement {
  id: string;
  productId: string;
  productName: string;
  startsAt: string;
  /** Null means perpetual — a one-time purchase that never lapses. */
  endsAt: string | null;
  /** Whether it covers this moment: granted, not revoked, not yet expired. */
  isActive: boolean;
}
