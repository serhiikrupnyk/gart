import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { NotificationList, PublicNotification, PushPublicKeyResponse } from '@gart/shared';

import {
  CurrentViewerTenant,
  TrainerOrClientGuard,
  type ViewerTenant,
} from '../auth/trainer-or-client.guard';
import { NotificationsQuery, SubscribePushDto, UnsubscribePushDto } from './dto/notification.dto';
import { NotificationService, type NotificationScope } from './notification.service';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { WebPushSender } from './web-push-sender';

/**
 * One controller for both hats. Which stream a caller reads is decided by the
 * session they hold, never by anything they send: a client session carries a
 * clientId and therefore reads the CLIENT audience of their own row only, a
 * trainer session reads their tenant's TRAINER audience.
 */
@Controller('notifications')
@UseGuards(TrainerOrClientGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly subscriptions: PushSubscriptionsService,
    private readonly sender: WebPushSender,
  ) {}

  @Get()
  async list(
    @CurrentViewerTenant() viewer: ViewerTenant,
    @Query() query: NotificationsQuery,
  ): Promise<NotificationList> {
    return this.notifications.list(scopeOf(viewer), query.page ?? 1);
  }

  @Patch(':id/read')
  async markRead(
    @CurrentViewerTenant() viewer: ViewerTenant,
    @Param('id') id: string,
  ): Promise<PublicNotification> {
    return this.notifications.markRead(scopeOf(viewer), id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@CurrentViewerTenant() viewer: ViewerTenant): Promise<void> {
    await this.notifications.markAllRead(scopeOf(viewer));
  }

  /** Served rather than bundled, so rotating the key needs no web rebuild. */
  @Get('push/key')
  publicKey(): PushPublicKeyResponse {
    return { publicKey: this.sender.publicKey() };
  }

  @Post('push/subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(
    @CurrentViewerTenant() viewer: ViewerTenant,
    @Body() dto: SubscribePushDto,
  ): Promise<void> {
    await this.subscriptions.subscribe(viewer.userId, dto);
  }

  /**
   * POST rather than DELETE-with-a-body: the endpoint is too long for a path
   * segment, and enough proxies drop bodies from DELETE to make it a bad bet.
   */
  @Post('push/unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @CurrentViewerTenant() viewer: ViewerTenant,
    @Body() dto: UnsubscribePushDto,
  ): Promise<void> {
    await this.subscriptions.unsubscribe(viewer.userId, dto.endpoint);
  }
}

function scopeOf(viewer: ViewerTenant): NotificationScope {
  return viewer.clientId === undefined
    ? { audience: 'TRAINER', trainerId: viewer.trainerId }
    : { audience: 'CLIENT', trainerId: viewer.trainerId, clientId: viewer.clientId };
}
