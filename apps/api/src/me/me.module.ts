import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ClientWorkoutsService } from './client-workouts.service';
import { MeController } from './me.controller';
import { WorkoutLogsController } from './workout-logs.controller';
import { WorkoutLogsService } from './workout-logs.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [MeController, WorkoutLogsController],
  providers: [ClientWorkoutsService, WorkoutLogsService],
})
export class MeModule {}
