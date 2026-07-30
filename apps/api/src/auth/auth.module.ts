import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticatedGuard } from './authenticated.guard';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';
import { ClientGuard } from './client.guard';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TrainerGuard } from './trainer.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, ClientAuthController],
  providers: [
    AuthService,
    ClientAuthService,
    AuthenticatedGuard,
    TrainerGuard,
    ClientGuard,
    PasswordService,
    SessionService,
  ],
  // Exported so feature modules can put routes behind either guard, and so the
  // invite flow can hash passwords and issue sessions for accepted clients.
  exports: [TrainerGuard, ClientGuard, PasswordService, SessionService],
})
export class AuthModule {}
