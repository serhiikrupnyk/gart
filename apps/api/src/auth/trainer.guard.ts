import { type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import type { AuthenticatedRequest } from './auth-context';
import { AuthenticatedGuard, type PrincipalRequest } from './authenticated.guard';

/**
 * Requires a TRAINER-context session and attaches the trainer tenant. The
 * context check is what keeps a client session — even one belonging to a user
 * who also owns a Trainer — off these routes: the session's hat was fixed when
 * it was issued, not guessed from what the user could be.
 *
 * Produces the same `request.auth` shape the trainer routes have used since
 * Step 3, so controllers are untouched by the guard split.
 */
@Injectable()
export class TrainerGuard extends AuthenticatedGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);

    const request = context.switchToHttp().getRequest<PrincipalRequest & AuthenticatedRequest>();
    const principal = request.principal;

    if (principal === undefined) {
      throw new UnauthorizedException();
    }

    const { session, token } = principal;

    if (session.context !== 'TRAINER' || session.user.trainer === null) {
      throw new UnauthorizedException();
    }

    request.auth = {
      user: session.user,
      trainer: session.user.trainer,
      sessionToken: token,
    };

    return true;
  }
}
