import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { DatabaseModule } from '../database/database.module';
import {
  ClientPaymentsController,
  MeEntitlementsController,
  PaymentCallbackController,
  PaymentsController,
} from './payments.controller';
import { PaymentProviderModule } from './payment-provider.module';
import { PaymentsService } from './payments.service';

@Module({
  imports: [DatabaseModule, AuthModule, ClientsModule, PaymentProviderModule],
  controllers: [
    ClientPaymentsController,
    MeEntitlementsController,
    PaymentCallbackController,
    PaymentsController,
  ],
  providers: [PaymentsService],
})
export class PaymentsModule {}
