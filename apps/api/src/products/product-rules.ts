import { BadRequestException } from '@nestjs/common';
import type { ProductKind, SubscriptionPeriod } from '@gart/shared';

const SUBSCRIPTION_NEEDS_PERIOD = 'Підписка потребує періодичності';
const SUBSCRIPTION_NO_ACCESS_DAYS = 'У підписки період і є тривалістю доступу';
const ONE_TIME_NO_PERIOD = 'Разовий продукт не має періодичності';

export interface ProductShape {
  kind: ProductKind;
  period: SubscriptionPeriod | null;
  accessDays: number | null;
}

/**
 * The one place the two kinds are told apart, so a combination like
 * «subscription that also expires after 30 days» cannot reach the database:
 *
 *                   period          accessDays
 *   ONE_TIME        forbidden       optional (null = access never lapses)
 *   SUBSCRIPTION    required        forbidden (the period IS the duration)
 *
 * Same shape as resolveHabitShape and the program section rules — a readable
 * table returning a normalised value, rather than decorators that can only ever
 * see one field at a time and so cannot express a relationship between two.
 */
export function resolveProductShape(
  kind: ProductKind,
  period: SubscriptionPeriod | null | undefined,
  accessDays: number | null | undefined,
): ProductShape {
  const wantedPeriod = period ?? null;
  const wantedDays = accessDays ?? null;

  if (kind === 'SUBSCRIPTION') {
    if (wantedPeriod === null) {
      throw new BadRequestException(SUBSCRIPTION_NEEDS_PERIOD);
    }
    if (wantedDays !== null) {
      throw new BadRequestException(SUBSCRIPTION_NO_ACCESS_DAYS);
    }

    return { kind, period: wantedPeriod, accessDays: null };
  }

  if (wantedPeriod !== null) {
    throw new BadRequestException(ONE_TIME_NO_PERIOD);
  }

  // The range itself is the DTO's job on both routes, and the merged value on
  // an update came from a column those same rules wrote. Re-checking it here
  // would be a second source of truth for the bounds, free to drift.
  return { kind, period: null, accessDays: wantedDays };
}
