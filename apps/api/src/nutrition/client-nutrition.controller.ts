import { Controller, Get, UseGuards } from '@nestjs/common';
import type { ClientNutrition } from '@gart/shared';

import { type ClientAuthContext, CurrentClientAuth } from '../auth/client-auth-context';
import { ClientGuard } from '../auth/client.guard';
import { PrismaService } from '../database/prisma.service';
import { MealPlanAssignmentsService } from './meal-plan-assignments.service';
import { subscriptionHasNutrition } from './nutrition-access';

/**
 * A client's own nutrition plans.
 *
 * Read-only this step — logging what was actually eaten is Step 31.
 *
 * NutritionGuard is deliberately NOT used here, and its absence is the design.
 * That guard answers 402 «upgrade your plan», which is the right answer to the
 * person who pays and the wrong one to a client who does not. Availability
 * arrives as DATA instead: the section closes, the app says so plainly, and
 * nothing about the trainer's billing crosses to them.
 *
 * It IS gated on the same rule, though — the trainer's LIVE GROW, through the
 * same `subscriptionHasNutrition` adapter. Without it a trainer could assign
 * plans to fifty clients on one month of GROW and have them kept for ever,
 * which is the attrition hole one step removed.
 */
@Controller('me/nutrition')
@UseGuards(ClientGuard)
export class ClientNutritionController {
  constructor(
    private readonly assignments: MealPlanAssignmentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async mine(@CurrentClientAuth() auth: ClientAuthContext): Promise<ClientNutrition> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { trainerId: auth.trainer.id },
    });

    if (!subscriptionHasNutrition(subscription, new Date())) {
      // Closed, not broken, and not empty-because-nothing-was-assigned: the
      // flag distinguishes those two so the app can say the right thing.
      return { available: false, plans: [] };
    }

    return {
      available: true,
      plans: await this.assignments.listForClient(auth.trainer.id, auth.client.id),
    };
  }
}
