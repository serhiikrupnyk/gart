import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { PublicSubscription } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { ChangePeriodDto, OpenSubscriptionDto } from './dto/open-subscription.dto';
import { PaymentsService } from './payments.service';
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
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  async mine(@CurrentAuth() auth: AuthContext): Promise<PublicSubscription | null> {
    return this.subscriptions.forTrainer(auth.trainer.id, new Date());
  }

  /**
   * Opens a hosted checkout and hands back where to send the trainer.
   *
   * Nothing is granted here. Access follows the settlement, so a trainer who
   * closes the acquirer's tab is exactly where they were.
   */
  @Post('checkout')
  async checkout(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: OpenSubscriptionDto,
  ): Promise<{ redirectUrl: string }> {
    return this.payments.openSubscription(auth.trainer.id, dto.plan, dto.period);
  }

  /** Changes the billing cadence from the next renewal. Charges nothing now. */
  @Post('period')
  async changePeriod(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangePeriodDto,
  ): Promise<PublicSubscription> {
    return this.present(
      auth.trainer.id,
      await this.subscriptions.changePeriod(auth.trainer.id, dto.period),
    );
  }

  @Post('cancel')
  async cancel(@CurrentAuth() auth: AuthContext): Promise<PublicSubscription> {
    return this.present(
      auth.trainer.id,
      await this.subscriptions.cancel(auth.trainer.id, new Date()),
    );
  }

  @Post('reactivate')
  async reactivate(@CurrentAuth() auth: AuthContext): Promise<PublicSubscription> {
    return this.present(
      auth.trainer.id,
      await this.subscriptions.reactivate(auth.trainer.id, new Date()),
    );
  }

  /**
   * One shape for every route, so a screen never has to reload after acting to
   * find out what its own allowance now is.
   */
  private async present(
    trainerId: string,
    subscription: Parameters<SubscriptionsService['toPublic']>[0],
  ): Promise<PublicSubscription> {
    return this.subscriptions.toPublic(
      subscription,
      new Date(),
      await this.subscriptions.countClients(trainerId),
    );
  }
}
