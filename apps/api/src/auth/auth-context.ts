import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { TrainerModel, UserModel } from '../generated/prisma/models.js';

/**
 * What the guard puts on the request: the signed-in user and the tenant every
 * downstream query must be scoped to.
 */
export interface AuthContext {
  user: UserModel;
  trainer: TrainerModel;
  sessionToken: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.auth === undefined) {
      // Unreachable through AuthGuard; this catches the decorator being used on
      // a route that forgot the guard.
      throw new Error('CurrentAuth used on a route that is not behind AuthGuard');
    }

    return request.auth;
  },
);
