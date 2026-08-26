import { HttpException, HttpStatus } from '@nestjs/common';
import { clientAllowance, TRIAL_MAX_CLIENTS } from '@gart/shared';

import type { Prisma } from '../generated/prisma/client.js';

/**
 * Says what is happening AND what to do about it. «Ліміт вичерпано» on its own
 * tells a trainer they are stuck; naming both ways out tells them they are not.
 */
const CLIENT_LIMIT_MESSAGE =
  `У пробному періоді можна вести ${String(TRIAL_MAX_CLIENTS)} клієнтів. ` +
  'Оформіть підписку — на тарифі клієнтів без обмежень — або перенесіть в архів того, ' +
  'з ким уже не працюєте.';

/** The statuses that occupy a place. Archived clients keep their history, not a seat. */
const COUNTED: readonly ('INVITED' | 'ACTIVE')[] = ['INVITED', 'ACTIVE'];

/**
 * Refuses one more counted client when the allowance is full.
 *
 * MUST be called inside the transaction that performs the write, and is typed
 * to make that hard to get wrong: it takes a transaction client, not the root
 * one. A count taken outside the write's transaction is a check somebody else
 * can invalidate between reading and writing, and two concurrent creates would
 * both see room and both take it.
 *
 * The row lock is what actually serialises them. Counting inside a transaction
 * is not enough on its own — READ COMMITTED lets both transactions read the
 * same count — so every caller first takes an exclusive lock on the one row
 * they all share, the trainer's subscription. Concurrent attempts then queue
 * behind each other and the second sees the first's insert.
 *
 * A plain function over the transaction client rather than an injectable,
 * because a service would drag SubscriptionsService — and with it
 * NotificationsModule — into ClientsModule, closing a module cycle for a rule
 * that is two queries.
 *
 * 402 Payment Required, and not 403: this is not «you may not», it is «not on
 * what you are paying for», which is a distinction the trainer can act on and
 * the UI needs in order to say the right thing.
 *
 * SERVER-SIDE and unconditional. The screen hides the button when the allowance
 * is full, but the button is not the gate — this is, and it holds for a trainer
 * calling the API directly.
 *
 * Nothing existing is ever touched: this refuses to ADD to the count, so a
 * trainer at the limit keeps every client, plan and message they already have.
 */
export async function assertCanAddClient(
  tx: Prisma.TransactionClient,
  trainerId: string,
): Promise<void> {
  // Taken before the count, so concurrent callers serialise here rather than
  // racing. Locks the subscription row for the duration of the transaction.
  const locked = await tx.$queryRaw<{ plan: string; status: string }[]>`
    SELECT "plan"::text, "status"::text FROM "Subscription"
    WHERE "trainerId" = ${trainerId} FOR UPDATE
  `;
  const subscription = locked[0];

  // No subscription row at all is a trainer who predates billing, not a lapse.
  if (subscription === undefined) {
    return;
  }

  const allowance = clientAllowance(
    subscription.plan as Parameters<typeof clientAllowance>[0],
    subscription.status as Parameters<typeof clientAllowance>[1],
  );

  if (allowance === null) {
    return;
  }

  const used = await tx.client.count({
    where: { trainerId, status: { in: [...COUNTED] } },
  });

  if (used >= allowance) {
    throw new HttpException(CLIENT_LIMIT_MESSAGE, HttpStatus.PAYMENT_REQUIRED);
  }
}

/** Whether moving to `next` puts a client back among those that occupy a place. */
export function reclaimsAPlace(
  current: 'INVITED' | 'ACTIVE' | 'ARCHIVED',
  next: 'INVITED' | 'ACTIVE' | 'ARCHIVED' | undefined,
): boolean {
  return (
    current === 'ARCHIVED' && next !== undefined && COUNTED.includes(next as 'INVITED' | 'ACTIVE')
  );
}
