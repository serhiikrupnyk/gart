import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { readSessionCookie } from './session-cookie';
import { type SessionPrincipal, SessionService } from './session.service';

export interface PrincipalRequest extends Request {
  principal?: { session: SessionPrincipal; token: string };
}

/**
 * The shared first step of both guards: prove the cookie names a live session
 * and attach it. Says nothing about which hat the session wears — that is the
 * subclasses' job.
 *
 * Every failure here and in the subclasses is the same bare 401. A 403 for
 * "valid session, wrong context" would tell a prober their stolen cookie is a
 * real session of the other type — information the response has no business
 * volunteering.
 */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(protected readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PrincipalRequest>();
    const token = readSessionCookie(request);

    if (token === undefined) {
      throw new UnauthorizedException();
    }

    const session = await this.sessions.findValid(token);

    if (session === null) {
      throw new UnauthorizedException();
    }

    request.principal = { session, token };

    return true;
  }
}
