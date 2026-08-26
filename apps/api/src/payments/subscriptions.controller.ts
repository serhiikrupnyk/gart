import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { PublicSubscription } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { SubscriptionsService } from './subscriptions.service';

/**
 * The trainer's own subscription to Gart.
 *
 * Every route is scoped to the signed-in trainer and takes no identifier —
 * there is exactly one subscription per trainer, so «cancel» can only ever mean
 * their own. The trainer can stop it themselves: a subscription you cannot
 * stop yourself is the definition of a dark pattern.
 */
@Controller('billing/subscription')
@UseGuards(TrainerGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  async mine(@CurrentAuth() auth: AuthContext): Promise<PublicSubscription | null> {
    return this.subscriptions.forTrainer(auth.trainer.id, new Date());
  }

  @Post('cancel')
  async cancel(@CurrentAuth() auth: AuthContext): Promise<PublicSubscription> {
    const now = new Date();

    return this.subscriptions.toPublic(await this.subscriptions.cancel(auth.trainer.id, now), now);
  }

  @Post('reactivate')
  async reactivate(@CurrentAuth() auth: AuthContext): Promise<PublicSubscription> {
    const now = new Date();

    return this.subscriptions.toPublic(
      await this.subscriptions.reactivate(auth.trainer.id, now),
      now,
    );
  }
}
