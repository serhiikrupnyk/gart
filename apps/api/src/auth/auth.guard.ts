import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from './auth-context';
import { readSessionCookie } from './session-cookie';
import { SessionService } from './session.service';

/**
 * Authenticates the session cookie and attaches the user together with their
 * Trainer — the tenant every protected route scopes its data to.
 *
 * Loading the tenant here is why a stateless JWT would buy us nothing: the
 * database round-trip happens on every request regardless, so we may as well
 * get instant revocation out of it.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(request);

    if (token === undefined) {
      throw new UnauthorizedException();
    }

    const session = await this.sessions.findValid(token);

    // No trainer means this is not a trainer account. Client accounts arrive in
    // a later step and will need their own guard.
    if (session === null || session.user.trainer === null) {
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
