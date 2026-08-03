import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedRequest } from './auth-context';
import type { ClientAuthenticatedRequest } from './client-auth-context';
import { ClientGuard } from './client.guard';
import { TrainerGuard } from './trainer.guard';

/**
 * For routes both hats may read — exercise media, and later the whole client
 * workout surface. Composes the two real guards rather than re-implementing
 * their rules: TrainerGuard first, and if that hat does not fit, ClientGuard
 * with all its own checks (context, linkage, archived). Both failing is the
 * same bare 401 as everywhere else.
 */
@Injectable()
export class TrainerOrClientGuard implements CanActivate {
  constructor(
    private readonly trainerGuard: TrainerGuard,
    private readonly clientGuard: ClientGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await this.trainerGuard.canActivate(context);
    } catch {
      try {
        return await this.clientGuard.canActivate(context);
      } catch {
        throw new UnauthorizedException();
      }
    }
  }
}

/**
 * The tenant whose data the viewer is looking through: a trainer sees their
 * own; a client sees their trainer's. `clientId` is set only for the client
 * hat — routes serving something that belongs to ONE client (a progress photo)
 * narrow by it, while routes serving the shared library (exercise media)
 * ignore it.
 */
export interface ViewerTenant {
  /** The signed-in person — push subscriptions belong to a user, not a role. */
  userId: string;
  trainerId: string;
  clientId: string | undefined;
}

export const CurrentViewerTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ViewerTenant => {
    const request = context
      .switchToHttp()
      .getRequest<Request & AuthenticatedRequest & ClientAuthenticatedRequest>();

    const trainerId = request.auth?.trainer.id ?? request.clientAuth?.trainer.id;
    const userId = request.auth?.user.id ?? request.clientAuth?.user.id;

    if (trainerId === undefined || userId === undefined) {
      throw new Error('CurrentViewerTenant used on a route without TrainerOrClientGuard');
    }

    return { userId, trainerId, clientId: request.clientAuth?.client.id };
  },
);
