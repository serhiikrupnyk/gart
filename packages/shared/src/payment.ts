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

/** Only UAH today; the type exists so a second currency is additive. */
export type Currency = 'UAH';

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  UAH: '\u20B4',
};

/**
 * A price as Ukrainian typography renders it: «1 234,56 ₴».
 *
 * Formatted from the DECIMAL STRING, never through `Intl.NumberFormat`, which
 * would produce byte-identical output but only by taking a number first. The
 * rule this project set in Step 22 is that money never becomes a float
 * anywhere, and «anywhere» has to include the screen or it is not a rule.
 *
 * The separators are the ones uk-UA actually uses, and both are U+00A0: a
 * grouped price must not wrap between its thousands, nor a symbol away from its
 * amount.
 */
export function formatMoney(money: Money): string {
  const [whole = '0', fraction = ''] = money.amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  const cents = fraction.padEnd(2, '0').slice(0, 2);

  return `${grouped},${cents}\u00A0${CURRENCY_SYMBOLS[money.currency]}`;
}

/** What a trainer sells: one-time access, or a recurring subscription. */
export const PRODUCT_KINDS = ['ONE_TIME', 'SUBSCRIPTION'] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  ONE_TIME: 'Разовий',
  SUBSCRIPTION: 'Підписка',
};

/** The roadmap's own subscription vocabulary, fixed here so Step 25 inherits it. */
export const SUBSCRIPTION_PERIODS = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const;
export type SubscriptionPeriod = (typeof SUBSCRIPTION_PERIODS)[number];

export const SUBSCRIPTION_PERIOD_LABELS: Record<SubscriptionPeriod, string> = {
  MONTHLY: 'Щомісяця',
  QUARTERLY: 'Раз на квартал',
  SEMIANNUAL: 'Раз на пів року',
  ANNUAL: 'Раз на рік',
};

/**
 * Price bounds, in whole hryvnia.
 *
 * Zero is NOT a price. A free offer is a different concept that must never
 * touch the payment path — an acquirer cannot settle nothing, and Step 22's
 * `parseAmount` already refuses a non-positive amount, so a zero-priced product
 * could only ever produce a payment stuck pending. The floor of ₴1 and ceiling
 * of ₴1 000 000 are there to catch a misplaced decimal point in either
 * direction, which is the realistic data-entry error.
 */
export const PRODUCT_PRICE_MIN = 1;
export const PRODUCT_PRICE_MAX = 1_000_000;

/** A one-time product may grant access for a bounded stretch, or for ever. */
export const PRODUCT_ACCESS_DAYS_MIN = 1;
export const PRODUCT_ACCESS_DAYS_MAX = 3650;

export const PRODUCT_NAME_MAX = 80;
export const PRODUCT_DESCRIPTION_MAX = 500;

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
export const PAYMENT_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'В обробці',
  SUCCEEDED: 'Оплачено',
  FAILED: 'Не вдалося',
  REFUNDED: 'Повернуто',
};

export const PAYMENT_STATUS_FILTERS = ['all', ...PAYMENT_STATUSES] as const;
export type PaymentStatusFilter = (typeof PAYMENT_STATUS_FILTERS)[number];

export interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  kind: ProductKind;
  /** Set exactly when kind is SUBSCRIPTION. */
  period: SubscriptionPeriod | null;
  price: Money;
  /** Set only for ONE_TIME. Null there means access never lapses. */
  accessDays: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateProductRequest {
  name: string;
  description?: string | null;
  kind: ProductKind;
  period?: SubscriptionPeriod | null;
  /** A decimal string, so a price never travels as a float. */
  price: string;
  accessDays?: number | null;
}

export type UpdateProductRequest = Partial<CreateProductRequest> & { isActive?: boolean };

export const PRODUCT_STATUS_FILTERS = ['all', 'active', 'inactive'] as const;
export type ProductStatusFilter = (typeof PRODUCT_STATUS_FILTERS)[number];

/**
 * A payment as the TRAINER sees it: the whole commercial picture, including
 * what the platform took and what is left for them.
 */
export interface PublicPayment {
  id: string;
  clientId: string;
  clientName: string;
  productId: string;
  productName: string;
  amount: Money;
  /** The platform's cut, as charged on this payment — never recomputed. */
  platformFee: Money;
  /** amount − platformFee. The two always sum back to amount, exactly. */
  payout: Money;
  status: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
  /** Where the payer completes it, while it is still open. */
  checkoutUrl: string | null;
}

/**
 * A payment as the CLIENT sees it.
 *
 * A separate type rather than a subset of PublicPayment, deliberately: the
 * commission is a term between the platform and the trainer, and the surest way
 * for a client never to see it is for the shape they receive to have nowhere to
 * put it. Omission enforced by the type, not by remembering to omit.
 */
export interface ClientPayment {
  id: string;
  productName: string;
  amount: Money;
  status: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
  checkoutUrl: string | null;
}

/** What the client app shows: what is owed, and what it bought. */
export interface ClientPurchases {
  payments: ClientPayment[];
  entitlements: PublicEntitlement[];
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
