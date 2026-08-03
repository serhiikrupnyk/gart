import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { BullMqNotificationQueue } from './bullmq-notification-queue';
import { NotificationQueue } from './notification-queue';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import { PushDeliveryService } from './push-delivery.service';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { WebPushSender } from './web-push-sender';
import { WebPushSenderImpl } from './web-push.sender';

/**
 * Both infrastructure bindings sit behind abstract tokens, so tests swap in
 * fakes and no test run needs Redis or a push service — the same seam
 * StorageModule uses for object storage.
 *
 * `NotificationService` is the only export: every other module notifies
 * through it and stays ignorant of queues and VAPID.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationService,
    PushSubscriptionsService,
    PushDeliveryService,
    { provide: WebPushSender, useClass: WebPushSenderImpl },
    { provide: NotificationQueue, useClass: BullMqNotificationQueue },
  ],
  exports: [NotificationService, NotificationQueue],
})
export class NotificationsModule {}
