import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AssignmentsModule } from './assignments/assignments.module';
import { AuthModule } from './auth/auth.module';
import { globalThrottle } from './auth/throttle.config';
import { ClientsModule } from './clients/clients.module';
import { DatabaseModule } from './database/database.module';
import { ExercisesModule } from './exercises/exercises.module';
import { HealthController } from './health/health.controller';
import { InvitesModule } from './invites/invites.module';
import { ProgramsModule } from './programs/programs.module';

@Module({
  imports: [
    ThrottlerModule.forRoot(globalThrottle()),
    DatabaseModule,
    AuthModule,
    InvitesModule,
    ClientsModule,
    ExercisesModule,
    ProgramsModule,
    AssignmentsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
