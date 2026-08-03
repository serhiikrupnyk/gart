import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { DatabaseModule } from '../database/database.module';
import { ClientHabitsController, HabitsController, MeHabitsController } from './habits.controller';
import { HabitsService } from './habits.service';

@Module({
  imports: [DatabaseModule, AuthModule, ClientsModule],
  controllers: [ClientHabitsController, HabitsController, MeHabitsController],
  providers: [HabitsService],
})
export class HabitsModule {}
