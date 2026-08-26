import { TRIAL_DAYS, TRIAL_PLAN } from '@gart/shared';

import { addDays } from '../common/calendar';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Starts the free trial, in the transaction that creates the trainer.
 *
 * A plain function over a transaction client rather than a method on
 * SubscriptionsService, for two reasons. It needs nothing a service provides —
 * the transaction is handed in — and injecting the service into AuthService
 * would close a module cycle (Auth → Payments → Notifications → Auth) that
 * only `forwardRef` could unpick. A policy this small does not deserve one.
 *
 * Inside the registration transaction and not after it: a trainer who exists
 * without a subscription row is one the access rule cannot answer for, and
 * «signed up, but the follow-up write failed» would be a locked-out account on
 * somebody's very first screen.
 *
 * No card is taken and NO CHARGE IS EVER SCHEDULED — `nextChargeAt` stays null
 * and there is no mandate — so the trial cannot turn into a payment by
 * accident. When it runs out it simply lapses, with everything intact.
 */
export async function startTrial(
  tx: Prisma.TransactionClient,
  trainerId: string,
  now: Date,
): Promise<void> {
  const endsAt = addDays(now, TRIAL_DAYS);

  await tx.subscription.create({
    data: {
      trainerId,
      plan: TRIAL_PLAN,
      status: 'TRIALING',
      // Structurally required, and nothing reads it while trialing: no charge
      // is scheduled, and the price shown is whatever the trainer picks at
      // checkout. `prepareCheckout` overwrites it with the real choice.
      period: 'MONTHLY',
      currentPeriodStart: now,
      currentPeriodEnd: endsAt,
      anchorDay: now.getUTCDate(),
      accessUntil: endsAt,
      nextChargeAt: null,
    },
  });
}
