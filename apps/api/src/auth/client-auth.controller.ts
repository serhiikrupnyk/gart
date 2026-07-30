import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ClientSession } from '@gart/shared';
import type { Response } from 'express';

import { toPublicClient } from '../clients/client.mapper';
import { toTrainerBrand } from '../trainers/trainer.mapper';
import { type ClientAuthContext, CurrentClientAuth } from './client-auth-context';
import { ClientAuthService } from './client-auth.service';
import { ClientGuard } from './client.guard';
import { LoginDto } from './dto/login.dto';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from './session-cookie';
import { authThrottle } from './throttle.config';

/**
 * The client app's door into the same auth machinery: identical DTO, identical
 * hardening, but the session it issues wears the CLIENT hat and is bound to one
 * client profile. Logout is shared — /auth/logout revokes by token regardless
 * of context.
 */
@Controller('auth/client')
export class ClientAuthController {
  constructor(private readonly clientAuth: ClientAuthService) {}

  @Post('login')
  @Throttle(authThrottle())
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ClientSession> {
    const { session, token, expiresAt } = await this.clientAuth.login(dto);

    response.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));

    return session;
  }

  @Get('me')
  @UseGuards(ClientGuard)
  me(@CurrentClientAuth() auth: ClientAuthContext): ClientSession {
    return { client: toPublicClient(auth.client), trainer: toTrainerBrand(auth.trainer) };
  }
}
