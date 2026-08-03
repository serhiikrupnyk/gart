import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';

import type { AuthenticatedRequest } from './auth-context';
import { messageThrottle } from './throttle.config';

const THROTTLER_NAME = 'messages';

/**
 * A budget counted per TRAINER rather than per address.
 *
 * The stock guard tracks by IP, which is wrong in both directions here: a gym
 * where two trainers share a connection would throttle them together, and one
 * trainer with a phone and a laptop would get two budgets. It also cannot be
 * fixed by overriding the tracker, because the global throttler runs before
 * route guards — the tenant is not attached yet when it decides.
 *
 * So this counts explicitly, against the same storage the global limiter uses,
 * with the key it actually wants. The global per-address limit still applies
 * underneath as a coarse backstop.
 */
@Injectable()
export class TrainerThrottlerGuard implements CanActivate {
  constructor(@Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Placed after TrainerGuard, so the tenant is there; the address remains
    // the fallback for anything that somehow is not authenticated.
    const tracker = request.auth?.trainer.id ?? request.ip ?? 'unknown';
    const { limit, ttl } = messageThrottle();

    const window = ttl();
    // The block lasts the rest of the window. A zero here would make the
    // storage expire the block on the spot and reset the counter with it,
    // which is a limiter that never limits.
    const record = await this.storage.increment(
      `${THROTTLER_NAME}:${tracker}`,
      window,
      limit(),
      window,
      THROTTLER_NAME,
    );

    if (record.totalHits > limit() || record.isBlocked) {
      throw new ThrottlerException();
    }

    return true;
  }
}
