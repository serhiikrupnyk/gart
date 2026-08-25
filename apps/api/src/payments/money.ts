import type { Currency, Money } from '@gart/shared';

import { Prisma } from '../generated/prisma/client.js';

/**
 * Money arithmetic, kept in one place and never in floating point.
 *
 * `Number(decimal)` is how the rest of the app reads a Decimal, and for a habit
 * target at 8,2 that is fine — a chart is the only consumer. Money is the case
 * that repays the extra care: it is stored Decimal(12,2), computed with
 * Prisma.Decimal, and serialised as a STRING. It becomes a JavaScript number at
 * no point on the way.
 */

/** How many decimal places a UAH amount carries, matching Decimal(12, 2). */
const SCALE = 2;

export function toMoney(amount: Prisma.Decimal, currency: Currency): Money {
  return { amount: amount.toFixed(SCALE), currency };
}

/**
 * Whether two amounts are equal in value.
 *
 * Deliberately not a string comparison: a provider reporting "1500.0" or
 * "1500.000" means the same money as "1500.00", and rejecting a legitimate
 * settlement over trailing zeros would be a lost payment.
 */
export function amountsEqual(left: Prisma.Decimal, right: string): boolean {
  const parsed = parseAmount(right);

  return parsed !== null && parsed.equals(left);
}

/**
 * A decimal string to Decimal, or null when it is not a plain positive amount.
 *
 * Prisma.Decimal accepts things a payment never should — exponents, Infinity,
 * NaN, negatives — so the shape is checked before the value is trusted.
 *
 * Trailing zeros beyond two places are accepted and then required to be
 * MEANINGLESS: "1500.000" is 1500.00 and is a legitimate way for an acquirer to
 * render it, while "1500.005" is a different amount and is refused. Bounding
 * the format at two decimals instead would have rejected the first — and since
 * a refused callback answers 204, the provider would never retry, so the client
 * would have paid for access that never arrived.
 */
export function parseAmount(value: string): Prisma.Decimal | null {
  if (!/^\d{1,10}(\.\d{1,6})?$/.test(value)) {
    return null;
  }

  const parsed = new Prisma.Decimal(value);

  if (!parsed.isFinite() || !parsed.greaterThan(0)) {
    return null;
  }

  // Anything that survives rounding to the stored scale was only ever written
  // with more precision than it had.
  return parsed.equals(parsed.toDecimalPlaces(SCALE)) ? parsed : null;
}
