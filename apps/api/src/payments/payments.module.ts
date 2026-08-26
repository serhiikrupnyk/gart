import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentCallbackController, PaymentsController } from './payments.controller';
import { PaymentProviderModule } from './payment-provider.module';
import { PaymentsService } from './payments.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [DatabaseModule, AuthModule, NotificationsModule, PaymentProviderModule],
  controllers: [PaymentsController, PaymentCallbackController, SubscriptionsController],
  providers: [PaymentsService, SubscriptionsService],
})
export class PaymentsModule {}
