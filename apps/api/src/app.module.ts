import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AssignmentsModule } from './assignments/assignments.module';
import { AuthModule } from './auth/auth.module';
import { globalThrottle } from './auth/throttle.config';
import { ChatModule } from './chat/chat.module';
import { ClientsModule } from './clients/clients.module';
import { DatabaseModule } from './database/database.module';
import { ExercisesModule } from './exercises/exercises.module';
import { HabitsModule } from './habits/habits.module';
import { HealthController } from './health/health.controller';
import { InvitesModule } from './invites/invites.module';
import { MeModule } from './me/me.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { ProgramsModule } from './programs/programs.module';
import { ProgressModule } from './progress/progress.module';

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
    MeModule,
    MonitoringModule,
    ProgressModule,
    HabitsModule,
    NotificationsModule,
    ChatModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
