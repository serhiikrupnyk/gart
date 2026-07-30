import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { InvitesModule } from '../invites/invites.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [DatabaseModule, AuthModule, InvitesModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
