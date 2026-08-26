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
  UAH: '₴',
};

/**
 * A price as Ukrainian typography renders it: «1 234,56 ₴».
 *
 * Formatted from the DECIMAL STRING, never through `Intl.NumberFormat`, which
 * would produce byte-identical output but only by taking a number first. The
 * rule is that money never becomes a float anywhere, and «anywhere» has to
 * include the screen or it is not a rule.
 *
 * Both separators are U+00A0: a grouped price must not wrap between its
 * thousands, nor a symbol away from its amount.
 */
export function formatMoney(money: Money): string {
  const [whole = '0', fraction = ''] = money.amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  const cents = fraction.padEnd(2, '0').slice(0, 2);

  return `${grouped},${cents}\u00A0${CURRENCY_SYMBOLS[money.currency]}`;
}

/**
 * What a trainer subscribes to.
 *
 * Gart's own tiers, not anything a trainer sells: the platform's only revenue
 * is the trainer's subscription to it. Money never flows between a client and
 * their trainer through this system — they settle that between themselves.
 */
export const SUBSCRIPTION_PLANS = ['PRO', 'GROW', 'SCALE'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/**
 * Monthly price per plan, in hryvnia.
 *
 * PROVISIONAL — NOT DECIDED COMMERCIAL NUMBERS. The product docs say prices are
 * finalised against what a Ukrainian trainer can actually pay and name no
 * figures; these exist so the billing machinery can be built and measured.
 * They must be settled before anybody is charged.
 *
 * The docs also say a yearly payment should cost less than twelve monthly ones.
 * That discount is deliberately NOT invented here: `planPrice` multiplies, and
 * the schedule is Step 27's to decide rather than this file's to guess.
 */
const PLAN_MONTHLY_PRICES: Record<SubscriptionPlan, string> = {
  PRO: '500.00',
  GROW: '900.00',
  SCALE: '1500.00',
};

/** The roadmap's own subscription vocabulary, fixed here so Step 27 inherits it. */
export const SUBSCRIPTION_PERIODS = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const;
export type SubscriptionPeriod = (typeof SUBSCRIPTION_PERIODS)[number];

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
 * What one period of a plan costs.
 *
 * Whole hryvnia by construction — a monthly price with two decimal places times
 * a whole number of months, so the string arithmetic below cannot produce a
 * fraction of a kopiyka. The server re-derives this; it is never sent in.
 */
export function planPrice(plan: SubscriptionPlan, period: SubscriptionPeriod): Money {
  const [whole = '0', cents = '00'] = PLAN_MONTHLY_PRICES[plan].split('.');
  const months = SUBSCRIPTION_PERIOD_MONTHS[period];
  const total = (Number(whole) * 100 + Number(cents.padEnd(2, '0'))) * months;

  return {
    amount: `${String(Math.floor(total / 100))}.${String(total % 100).padStart(2, '0')}`,
    currency: 'UAH',
  };
}

/**
 * The canonical payment lifecycle. Every provider's own vocabulary maps onto
 * exactly these four before it reaches anything outside the provider adapter.
 */
export const PAYMENT_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'PAST_DUE', 'CANCELLED', 'ENDED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * The dunning policy, in one place because it is a POLICY and not a detail.
 *
 * A charge is attempted on the due date. If it fails, three more attempts
 * follow — on days 1, 3 and 5 after the period ended — and access continues
 * throughout. Only when the fourth attempt fails does access lapse.
 *
 * A card expiring should not cost somebody their workspace the same morning.
 * Five days is long enough to notice an email and fix a card, and short enough
 * that it is not a month of unpaid service.
 */
export const DUNNING_RETRY_DAYS = [1, 3, 5] as const;

/** The first attempt plus the retries above. */
export const DUNNING_MAX_ATTEMPTS = DUNNING_RETRY_DAYS.length + 1;

/**
 * How far past the period end access survives while the retries run.
 *
 * One day LONGER than the last retry, not the same day. A job can only run at
 * or after its due time, so grace expiring on the instant the final attempt is
 * scheduled would mean access had already lapsed before that attempt got its
 * chance.
 */
export const DUNNING_GRACE_DAYS = 6;

/** One charge against a trainer's plan. */
export interface PublicPayment {
  id: string;
  /** Null only if the subscription behind the charge is gone. */
  plan: SubscriptionPlan | null;
  amount: Money;
  status: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
}

/** A trainer's own subscription to Gart. */
export interface PublicSubscription {
  id: string;
  plan: SubscriptionPlan;
  period: SubscriptionPeriod;
  price: Money;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  /** How long access actually runs, dunning grace included. */
  accessUntil: string;
  nextChargeAt: string | null;
  /** 0 while healthy; 1..4 once charges are failing. */
  failedAttempts: number;
  /** Whether the workspace is live right now, by the one shared rule. */
  isActive: boolean;
  /** Whether reactivating is still possible, or it has lapsed for good. */
  canReactivate: boolean;
}
