import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ClientWorkoutsService } from './client-workouts.service';
import { MeController } from './me.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [MeController],
  providers: [ClientWorkoutsService],
})
export class MeModule {}
