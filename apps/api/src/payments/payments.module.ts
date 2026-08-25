import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  ClientPaymentsController,
  MeEntitlementsController,
  MePurchasesController,
  PaymentCallbackController,
  PaymentsController,
} from './payments.controller';
import { PaymentProviderModule } from './payment-provider.module';
import { PaymentsService } from './payments.service';

@Module({
  imports: [DatabaseModule, AuthModule, ClientsModule, NotificationsModule, PaymentProviderModule],
  controllers: [
    ClientPaymentsController,
    MeEntitlementsController,
    MePurchasesController,
    PaymentCallbackController,
    PaymentsController,
  ],
  providers: [PaymentsService],
})
export class PaymentsModule {}
