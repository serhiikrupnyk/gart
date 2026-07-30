import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthSession } from '@gart/shared';
import type { Request, Response } from 'express';

import { toPublicTrainer } from '../trainers/trainer.mapper';
import { toPublicUser } from '../users/user.mapper';
import { type AuthContext, CurrentAuth } from './auth-context';
import { AuthGuard } from './auth.guard';
import { type AuthResult, AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  clearedSessionCookieOptions,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from './session-cookie';
import { authThrottle } from './throttle.config';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle(authThrottle())
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    return this.setSessionCookie(await this.auth.register(dto), response);
  }

  @Post('login')
  @Throttle(authThrottle())
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    return this.setSessionCookie(await this.auth.login(dto), response);
  }

  /**
   * Deliberately not behind AuthGuard: logging out with an already-invalid
   * cookie should quietly succeed rather than return 401.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = readSessionCookie(request);

    if (token !== undefined) {
      await this.auth.logout(token);
    }

    response.clearCookie(SESSION_COOKIE_NAME, clearedSessionCookieOptions());
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentAuth() auth: AuthContext): AuthSession {
    return { user: toPublicUser(auth.user), trainer: toPublicTrainer(auth.trainer) };
  }

  private setSessionCookie(
    { session, token, expiresAt }: AuthResult,
    response: Response,
  ): AuthSession {
    response.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));

    return session;
  }
}
