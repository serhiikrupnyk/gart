import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { AcceptInviteService } from './accept-invite.service';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [InvitesController],
  providers: [InvitesService, AcceptInviteService],
  // ClientsModule issues invites when creating a client and when regenerating.
  exports: [InvitesService],
})
export class InvitesModule {}
