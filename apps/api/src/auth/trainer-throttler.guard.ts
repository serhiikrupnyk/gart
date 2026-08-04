import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

import type { AuthenticatedRequest } from './auth-context';
import { enforceRateLimit } from './rate-limit';
import { messageThrottle } from './throttle.config';

const THROTTLER_NAME = 'messages';

/**
 * A budget counted per TRAINER rather than per address: a gym where two
 * trainers share a connection must not throttle them together, and one trainer
 * with a phone and a laptop must not get two budgets.
 *
 * Placed after TrainerGuard, so the tenant is attached; the address remains the
 * fallback for anything that somehow is not authenticated.
 */
@Injectable()
export class TrainerThrottlerGuard implements CanActivate {
  constructor(@Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tracker = request.auth?.trainer.id ?? request.ip ?? 'unknown';

    await enforceRateLimit(this.storage, THROTTLER_NAME, tracker, messageThrottle());

    return true;
  }
}
