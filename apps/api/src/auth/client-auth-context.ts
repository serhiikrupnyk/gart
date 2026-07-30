import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { ClientModel, TrainerModel, UserModel } from '../generated/prisma/models.js';

/**
 * What ClientGuard puts on the request: the signed-in user, their client
 * profile, and the trainer that owns it — the tenant scope for everything a
 * client is allowed to see.
 */
export interface ClientAuthContext {
  user: UserModel;
  client: ClientModel;
  trainer: TrainerModel;
  sessionToken: string;
}

export interface ClientAuthenticatedRequest extends Request {
  clientAuth?: ClientAuthContext;
}

export const CurrentClientAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ClientAuthContext => {
    const request = context.switchToHttp().getRequest<ClientAuthenticatedRequest>();

    if (request.clientAuth === undefined) {
      // Unreachable through ClientGuard; this catches the decorator being used
      // on a route that forgot the guard.
      throw new Error('CurrentClientAuth used on a route that is not behind ClientGuard');
    }

    return request.clientAuth;
  },
);
