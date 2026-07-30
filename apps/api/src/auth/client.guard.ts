import { type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { AuthenticatedGuard, type PrincipalRequest } from './authenticated.guard';
import type { ClientAuthenticatedRequest } from './client-auth-context';

/**
 * Requires a CLIENT-context session and attaches the client together with the
 * trainer that owns them — the tenant every client-facing query scopes to.
 *
 * Archived clients are rejected here, not only at login: archiving takes effect
 * on the trainer's next request-old sessions included — the same revocation
 * philosophy as deleting a session row.
 */
@Injectable()
export class ClientGuard extends AuthenticatedGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);

    const request = context
      .switchToHttp()
      .getRequest<PrincipalRequest & ClientAuthenticatedRequest>();
    const principal = request.principal;

    if (principal === undefined) {
      throw new UnauthorizedException();
    }

    const { session, token } = principal;
    const client = session.client;

    // userId must still match: if the trainer re-linked or cleared the client's
    // account, a session minted under the old linkage dies with it.
    if (
      session.context !== 'CLIENT' ||
      client === null ||
      client.userId !== session.userId ||
      client.status === 'ARCHIVED'
    ) {
      throw new UnauthorizedException();
    }

    request.clientAuth = {
      user: session.user,
      client,
      trainer: client.trainer,
      sessionToken: token,
    };

    return true;
  }
}
