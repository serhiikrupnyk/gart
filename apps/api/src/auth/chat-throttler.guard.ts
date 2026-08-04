import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

import type { AuthenticatedRequest } from './auth-context';
import type { ClientAuthenticatedRequest } from './client-auth-context';
import { enforceRateLimit } from './rate-limit';
import { chatThrottle } from './throttle.config';

const THROTTLER_NAME = 'chat';

/**
 * A sending budget per PARTICIPANT — either hat sends here, so the key is
 * whichever principal the session resolved to. Placed after
 * TrainerOrClientGuard, with the address as the fallback.
 */
@Injectable()
export class ChatThrottlerGuard implements CanActivate {
  constructor(@Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & ClientAuthenticatedRequest>();
    const tracker =
      request.auth?.trainer.id ?? request.clientAuth?.client.id ?? request.ip ?? 'unknown';

    await enforceRateLimit(this.storage, THROTTLER_NAME, tracker, chatThrottle());

    return true;
  }
}
