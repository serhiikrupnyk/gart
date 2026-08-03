import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProgramsModule } from '../programs/programs.module';
import { AssignmentsController, ClientAssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [DatabaseModule, AuthModule, ClientsModule, ProgramsModule, NotificationsModule],
  controllers: [ClientAssignmentsController, AssignmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}
