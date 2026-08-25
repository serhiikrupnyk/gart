import { SUBSCRIPTION_PERIOD_MONTHS, type SubscriptionPeriod } from '@gart/shared';

import { MS_PER_DAY } from '../common/calendar';

/**
 * When a grant stops covering the client, or null for a purchase that never
 * lapses.
 *
 * Subscriptions are counted in months rather than in days on purpose: 30 days
 * is not a month, and a monthly subscription billed every 30 days drifts
 * forward by roughly five days a year until the charge lands in the wrong
 * calendar month entirely.
 *
 * A `period` wins over `accessDays` when a product somehow carries both. The
 * schema says the two are mutually exclusive and Step 23's product CRUD will
 * enforce it, but this function runs today against rows nothing has validated,
 * and a subscription silently expiring after an `accessDays` it should never
 * have had is the worse of the two ways to be wrong.
 */
export function entitlementEnd(
  startsAt: Date,
  product: { period: SubscriptionPeriod | null; accessDays: number | null },
): Date | null {
  if (product.period !== null) {
    return addMonths(startsAt, SUBSCRIPTION_PERIOD_MONTHS[product.period]);
  }

  return product.accessDays === null
    ? null
    : new Date(startsAt.getTime() + product.accessDays * MS_PER_DAY);
}

/**
 * Calendar months, clamped to the end of a short month.
 *
 * V8 rolls 31 January + 1 month over into 3 March, which would silently grant
 * two extra days. Clamping to 28 February is the answer every billing system
 * converges on.
 */
export function addMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const day = from.getUTCDate();

  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}
