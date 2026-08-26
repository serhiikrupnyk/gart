import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { NUTRITION_PLAN } from '@gart/shared';

import type { AuthenticatedRequest } from '../auth/auth-context';
import { PrismaService } from '../database/prisma.service';
import { subscriptionHasNutrition } from './nutrition-access';

const UPGRADE_MESSAGE =
  `Харчування доступне на тарифі ${NUTRITION_PLAN}. ` +
  'Ваші власні продукти збережені й повернуться одразу після оформлення.';

/**
 * Refuses nutrition to a trainer whose plan does not include it.
 *
 * Applied at CONTROLLER level and never as a per-route decorator, for the
 * reason Step 27's lapse guard is global: a rule that has to be remembered on
 * each route is enforced only on the routes somebody remembered. Every route in
 * a controller carrying this guard is covered before it is written, and Steps
 * 30 and 31 must carry it on their controllers too.
 *
 * 402 rather than 403 — this is not «you may not», it is «not on what you are
 * paying for», which is a distinction the trainer can act on and the screen
 * needs in order to offer the right thing.
 *
 * Runs AFTER TrainerGuard, which is what makes `request.auth` available: guards
 * on the same controller execute in the order they are listed.
 */
@Injectable()
export class NutritionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;

    if (auth === undefined) {
      // Unreachable behind TrainerGuard; this catches the guard being listed
      // first, or used on a controller that forgot it.
      throw new Error('NutritionGuard used on a route that is not behind TrainerGuard');
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { trainerId: auth.trainer.id },
    });

    if (!subscriptionHasNutrition(subscription, new Date())) {
      throw new HttpException(UPGRADE_MESSAGE, HttpStatus.PAYMENT_REQUIRED);
    }

    return true;
  }
}
