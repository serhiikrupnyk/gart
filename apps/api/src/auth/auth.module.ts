import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, PasswordService, SessionService],
  // Exported so feature modules can put routes behind the guard, and so the
  // invite flow can hash passwords and issue sessions for accepted clients.
  exports: [AuthGuard, PasswordService, SessionService],
})
export class AuthModule {}
