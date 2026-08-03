import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { DatabaseModule } from '../database/database.module';
import { WorkoutHistoryController } from './workout-history.controller';
import { WorkoutHistoryService } from './workout-history.service';

@Module({
  imports: [DatabaseModule, AuthModule, ClientsModule],
  controllers: [WorkoutHistoryController],
  providers: [WorkoutHistoryService],
})
export class MonitoringModule {}
