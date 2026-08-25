import { Prisma } from '../generated/prisma/client.js';

export const COMMISSION_PERCENT_ENV = 'PLATFORM_COMMISSION_PERCENT';

/**
 * The platform's cut of a trainer→client payment, as a percentage.
 *
 * PROVISIONAL. The product docs call split commission an additional potential
 * stream beside the trainer's own subscription, and name no rate; 5 is a
 * placeholder chosen so the mechanism can be built and measured, not a
 * commercial decision. It must be revisited before any real acquirer goes live
 * — an acquirer takes roughly 2.5% of its own, so this is not the whole cost to
 * the trainer.
 *
 * Changing it is safe by construction: every payment snapshots the fee it was
 * actually charged, so a new rate applies to new checkouts and rewrites nothing.
 */
const DEFAULT_COMMISSION_PERCENT = 5;

/** How the money divides, exactly, with no remainder unaccounted for. */
export interface Split {
  fee: Prisma.Decimal;
  payout: Prisma.Decimal;
}

/**
 * Reads the configured rate, refusing anything that is not a sane percentage.
 *
 * A misconfigured rate is not a value to fall back from quietly: 500 would take
 * five times the payment and a negative one would pay the trainer more than the
 * client paid. Both stop the boot instead.
 */
export function commissionPercent(env: NodeJS.ProcessEnv): Prisma.Decimal {
  const raw = env[COMMISSION_PERCENT_ENV];

  if (raw === undefined || raw === '') {
    return new Prisma.Decimal(DEFAULT_COMMISSION_PERCENT);
  }

  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) {
    throw new Error(`${COMMISSION_PERCENT_ENV} must be a percentage between 0 and 100, got ${raw}`);
  }

  const parsed = new Prisma.Decimal(raw);

  // Only the ceiling needs checking: the pattern above admits no sign, so a
  // negative rate is already gone, while 101-999 pass it.
  if (parsed.greaterThan(100)) {
    throw new Error(`${COMMISSION_PERCENT_ENV} must be a percentage between 0 and 100, got ${raw}`);
  }

  return parsed;
}

/**
 * Divides an amount into the platform's fee and the trainer's payout.
 *
 * Two rules, each doing one job.
 *
 * The fee ROUNDS DOWN: the platform never rounds its own commission up, so a
 * fraction of a kopiyka always goes to the trainer. It is a rule that needs no
 * explaining to the person on the other side of it.
 *
 * The payout is then DERIVED BY SUBTRACTION rather than computed and rounded
 * separately. That is what makes `fee + payout === amount` true by construction
 * rather than by luck — rounding both independently is the classic way for the
 * two halves to stop summing to what the client actually paid.
 *
 * Decimal throughout, and the reason is not theoretical: ₴23.00 at 5% is
 * exactly 1.15, but 1.15 has no exact binary form, so a float lands on
 * 1.1499999999999999 and the floor takes a whole kopiyka off the platform — on
 * a round number.
 */
export function splitAmount(amount: Prisma.Decimal, percent: Prisma.Decimal): Split {
  const fee = amount.times(percent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);

  return { fee, payout: amount.minus(fee) };
}
