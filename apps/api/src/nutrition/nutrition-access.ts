import { hasNutrition } from '@gart/shared';

import { isSubscriptionLive } from '../payments/access';
import type { SubscriptionModel } from '../generated/prisma/models.js';

/**
 * The ONE place a subscription row is turned into «may reach nutrition».
 *
 * One adapter and not two call sites composing the same pair, because the
 * guard and the status endpoint must never be able to disagree about who has
 * nutrition — a screen that says «available» over an API that answers 402 is
 * worse than either answer alone.
 *
 * A trainer with no subscription row at all predates billing and is waved
 * through, which is the reading the lapse guard and the client allowance both
 * take.
 */
export function subscriptionHasNutrition(
  subscription: SubscriptionModel | null,
  now: Date,
): boolean {
  if (subscription === null) {
    return true;
  }

  return hasNutrition(
    subscription.plan,
    subscription.status,
    isSubscriptionLive(subscription, now),
  );
}
