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
 * What a plan actually unlocks, and whether it can be bought yet.
 *
 * PRO AND GROW ARE SELLABLE; SCALE IS NOT, and that is a deliberate product
 * decision rather than an unfinished implementation. A plan becomes sellable
 * when something real stands behind it: GROW earned it in Step 29, which built
 * the nutrition library the trainer's own docs name as its differentiator.
 * SCALE is defined by a bigger team and an extended agenda, neither of which
 * exists, so it stays «скоро» with no way to pay for it and the server refuses
 * to open a subscription for it at all.
 *
 * GROW's other promised features — meals and plans, the food log, group chats,
 * group sessions and team — are still unbuilt. The plan chooser therefore lists
 * what ships TODAY as features and names every one of those separately as
 * «незабаром», so what is being paid for now and what is coming are visibly
 * different things.
 *
 * `maxClients` is null for «no limit», which is what the docs promise of PRO:
 * «безлім клієнтів». The only real cap in the system belongs to the trial (see
 * `TRIAL_MAX_CLIENTS`) — capping a paid plan on client count would contradict
 * what we say we sell.
 *
 * When a Phase 4 feature lands, it gains a field here and the check that reads
 * it, so the gate arrives with the feature instead of being retrofitted.
 */
export interface PlanCapabilities {
  /** Whether a trainer can subscribe to this plan right now. */
  sellable: boolean;
  /** Null means unlimited. */
  maxClients: number | null;
  /**
   * The food library, meals and the food log.
   *
   * The first capability that is genuinely a FEATURE rather than a limit, and
   * the reason this registry exists: the server reads it, the plan chooser
   * reads it, and the upsell reads it, so «what GROW gives you» is one fact in
   * one place rather than three that can drift.
   */
  nutrition: boolean;
}

export const PLAN_CAPABILITIES: Record<SubscriptionPlan, PlanCapabilities> = {
  PRO: { sellable: true, maxClients: null, nutrition: false },
  GROW: { sellable: true, maxClients: null, nutrition: true },
  SCALE: { sellable: false, maxClients: null, nutrition: true },
};

/** The plan a trainer must be on for nutrition — named once, read everywhere. */
export const NUTRITION_PLAN = 'GROW' satisfies SubscriptionPlan;

/**
 * Whether this subscription may reach nutrition.
 *
 * Two conditions, and the first is LIVE ACCESS rather than a list of statuses.
 *
 * A tier feature is available while the tier is being paid for, and not after.
 * Keying on liveness rather than on `status !== 'ENDED'` is what makes that
 * true in every case rather than most of them: a PAST_DUE trainer inside their
 * dunning grace is still live, so a failed card does not take their work out of
 * sight while they fix it — but a CANCELLED subscription that has run out is
 * NOT live, and `endLapsed` only ever moves PAST_DUE rows to ENDED, so it would
 * have sat CANCELLED for ever. Gating on the status word would have left
 * cancelling open as a way to buy GROW once and keep it.
 *
 * That is a softer version of the reactivate hole from Step 27, and it is
 * closed the same way: by asking what is actually true now rather than what
 * some state machine last wrote down.
 *
 * Nothing is destroyed by any of this. The data stays, `NutritionStatus` keeps
 * answering with the count on every plan, and it all returns on re-upgrade.
 *
 * A TRIAL runs on PRO and so excludes nutrition, deliberately: a trial exists
 * to show what the built product does for the plan somebody is most likely to
 * buy, and quietly handing out a higher tier for fourteen days would make the
 * tier boundary meaningless at exactly the moment it is being learned.
 */
export function hasNutrition(
  plan: SubscriptionPlan,
  status: SubscriptionStatus,
  accessIsLive: boolean,
): boolean {
  if (!accessIsLive) {
    return false;
  }

  return status === 'TRIALING'
    ? PLAN_CAPABILITIES[TRIAL_PLAN].nutrition
    : PLAN_CAPABILITIES[plan].nutrition;
}

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

export const SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'ENDED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * The trial: fourteen days, no card, and NOTHING IS EVER CHARGED at the end.
 *
 * A trial that takes a card up front and quietly bills on day fifteen is the
 * pattern people resent, and our own docs argue against it («без фідлеїзації»).
 * So the trial takes no payment method at all: when it runs out the workspace
 * simply lapses into the same read-only state as any unpaid subscription, with
 * every client, programme and message still intact.
 *
 * Fourteen days spans two full training weeks, which is the shortest honest
 * window for judging software whose whole subject is weekly programming.
 */
export const TRIAL_DAYS = 14;

/**
 * The one limit the trial carries, and the only client cap in the product.
 *
 * Three is enough to run a real week with real people rather than a toy, and
 * small enough that a working roster is a reason to subscribe. It applies ONLY
 * while trialing: every paid plan is unlimited, because that is what «безлім
 * клієнтів» means.
 *
 * Reaching it never destroys anything. Existing clients keep working in full;
 * the only refusal is adding one more.
 */
export const TRIAL_MAX_CLIENTS = 3;

/** The plan a trial runs on: the built product is PRO, so a trial is a PRO trial. */
export const TRIAL_PLAN: SubscriptionPlan = 'PRO';

/**
 * How many clients a subscription in this state may have, null for unlimited.
 *
 * The single authority both the API guard and the UI read, so a screen can
 * never promise a capacity the server will refuse.
 */
export function clientAllowance(plan: SubscriptionPlan, status: SubscriptionStatus): number | null {
  return status === 'TRIALING' ? TRIAL_MAX_CLIENTS : PLAN_CAPABILITIES[plan].maxClients;
}

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
  /**
   * A cadence change taking effect at the next renewal, or null.
   *
   * Changes land on the boundary: the period already paid for runs on the
   * terms it was bought under, so no money moves and nothing is prorated.
   */
  pendingPeriod: SubscriptionPeriod | null;
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
  /** How many clients this subscription allows, null for unlimited. */
  maxClients: number | null;
  /** How many the trainer has, so a screen can warn before the API refuses. */
  clientCount: number;
}
