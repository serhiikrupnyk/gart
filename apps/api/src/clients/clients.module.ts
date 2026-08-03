import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { InvitesModule } from '../invites/invites.module';
import { ActivityModule } from '../monitoring/activity.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [DatabaseModule, AuthModule, InvitesModule, ActivityModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  // AssignmentsModule gates client ownership through the same requireOwned.
  exports: [ClientsService],
})
export class ClientsModule {}
