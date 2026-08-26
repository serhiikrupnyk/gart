import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { ClientSubscription, PublicSubscription } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { type ClientAuthContext, CurrentClientAuth } from '../auth/client-auth-context';
import { ClientGuard } from '../auth/client.guard';
import { TrainerGuard } from '../auth/trainer.guard';
import { SubscriptionListQuery } from './dto/payment.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@UseGuards(TrainerGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: SubscriptionListQuery,
  ): Promise<PublicSubscription[]> {
    return this.subscriptions.forTrainer(auth.trainer.id, query.status ?? 'all', new Date());
  }

  /**
   * The trainer stops a subscription — they own the relationship and may stop
   * working with someone. Future charges end; access runs to the paid period's
   * end, because cancelling is not refunding.
   */
  @Post(':id/cancel')
  async cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<PublicSubscription> {
    const now = new Date();
    const cancelled = await this.subscriptions.cancel(
      { trainerId: auth.trainer.id },
      id,
      'TRAINER',
      now,
    );

    return this.subscriptions.toPublic(cancelled, now);
  }

  @Post(':id/reactivate')
  async reactivate(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<PublicSubscription> {
    const now = new Date();
    const resumed = await this.subscriptions.reactivate({ trainerId: auth.trainer.id }, id, now);

    return this.subscriptions.toPublic(resumed, now);
  }
}

/**
 * The client's own subscriptions.
 *
 * They can cancel, and that is deliberate: it is their money and their
 * recurring charge, and a subscription you cannot stop yourself is the
 * definition of a dark pattern. Every route here is scoped to the signed-in
 * client, so «cancel» can only ever mean their own.
 */
@Controller('me/subscriptions')
@UseGuards(ClientGuard)
export class MeSubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  async mine(@CurrentClientAuth() auth: ClientAuthContext): Promise<ClientSubscription[]> {
    return this.subscriptions.forClient(auth.trainer.id, auth.client.id, new Date());
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentClientAuth() auth: ClientAuthContext,
    @Param('id') id: string,
  ): Promise<ClientSubscription> {
    const now = new Date();
    const cancelled = await this.subscriptions.cancel(
      { trainerId: auth.trainer.id, clientId: auth.client.id },
      id,
      'CLIENT',
      now,
    );

    return this.subscriptions.toClient(cancelled, now);
  }

  @Post(':id/reactivate')
  async reactivate(
    @CurrentClientAuth() auth: ClientAuthContext,
    @Param('id') id: string,
  ): Promise<ClientSubscription> {
    const now = new Date();
    const resumed = await this.subscriptions.reactivate(
      { trainerId: auth.trainer.id, clientId: auth.client.id },
      id,
      now,
    );

    return this.subscriptions.toClient(resumed, now);
  }
}
