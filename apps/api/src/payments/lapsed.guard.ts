import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

import type { PrincipalRequest } from '../auth/authenticated.guard';
import { readSessionCookie } from '../auth/session-cookie';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../database/prisma.service';
import { isSubscriptionLive } from './access';

const LAPSED_MESSAGE =
  'Підписка неактивна — робочий простір у режимі перегляду. ' +
  'Усі дані на місці, ваші клієнти тренуються як зазвичай. ' +
  'Оформіть підписку, щоб знову вносити зміни.';

/** Requests that change nothing, so nothing needs to be paid for. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Paths that must keep working while lapsed, because they are the way out.
 *
 * Kept to the two that genuinely are. `/auth` so a trainer can sign in and
 * out at all, and `/billing` so they can pay. Everything else is a feature,
 * and a feature that carved itself an exception here would quietly become the
 * reason the guard stopped meaning anything.
 *
 * `/payments/callback` is not listed and does not need to be: an acquirer
 * carries no session, so the guard never engages with it.
 */
const ALWAYS_ALLOWED = ['/auth', '/billing'];

/** Matches a prefix as a whole path segment, so `/authorise` is not `/auth`. */
function isAllowed(path: string): boolean {
  return ALWAYS_ALLOWED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Refuses writes from a trainer whose subscription is not live.
 *
 * GLOBAL AND FAIL-CLOSED, and that is the whole point of the design. A guard
 * that had to be remembered on each route would be enforced only on the routes
 * somebody remembered; registered globally, a route added next year is covered
 * before it is written, and a mistake shows up as «this is refused» rather than
 * as unpaid usage nobody noticed.
 *
 * What lapsing does, precisely:
 *
 *  - The trainer keeps their whole workspace, readable in full. Nothing is
 *    deleted, hidden or degraded — reads are untouched.
 *  - They cannot write until they pay.
 *  - THEIR CLIENTS ARE NOT AFFECTED AT ALL. A client session is not a trainer
 *    session, so this guard never engages with one: workouts, logging,
 *    progress, habits and chat all keep working. A client did not choose their
 *    trainer's payment method, and taking somebody's training programme away
 *    over another person's expired card punishes the one who cannot fix it.
 *
 * It resolves the session itself rather than reading `request.auth`, because
 * global guards run before the route guards that set it. The lookup is cached
 * on the request, so AuthenticatedGuard reuses it instead of repeating it.
 */
@Injectable()
export class LapsedSubscriptionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<PrincipalRequest>();

    if (READ_METHODS.has(request.method)) {
      return true;
    }

    const path = request.path;

    if (isAllowed(path)) {
      return true;
    }

    const token = readSessionCookie(request);

    if (token === undefined) {
      // Unauthenticated. Not this guard's refusal to make — the route's own
      // guard answers 401, and answering 402 here would tell an anonymous
      // caller something about somebody else's billing.
      return true;
    }

    const session = await this.sessions.findValid(token);

    if (session === null) {
      return true;
    }

    request.principal = { session, token };

    const trainer = session.context === 'TRAINER' ? session.user.trainer : null;

    if (trainer === null) {
      return true;
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { trainerId: trainer.id },
    });

    // No subscription row at all is not a lapse — it is a trainer who predates
    // billing. Refusing them would be this guard inventing a state the rest of
    // the system does not have.
    if (subscription === null || isSubscriptionLive(subscription, new Date())) {
      return true;
    }

    throw new HttpException(LAPSED_MESSAGE, HttpStatus.PAYMENT_REQUIRED);
  }
}
