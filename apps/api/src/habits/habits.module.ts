import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientHabitsController, HabitsController, MeHabitsController } from './habits.controller';
import { HabitsService } from './habits.service';

@Module({
  imports: [DatabaseModule, AuthModule, ClientsModule, NotificationsModule],
  controllers: [ClientHabitsController, HabitsController, MeHabitsController],
  providers: [HabitsService],
})
export class HabitsModule {}
