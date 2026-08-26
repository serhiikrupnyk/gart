import {
  Body,
  Controller,
  Get,
  GoneException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { InvitePreview } from '@gart/shared';
import type { Response } from 'express';

import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../auth/session-cookie';
import { authThrottle } from '../auth/throttle.config';
import { AcceptInviteService } from './accept-invite.service';
import { brandLogoUrl } from '../trainers/trainer.mapper';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InvitesService } from './invites.service';

const EXPIRED_MESSAGE = 'Термін дії запрошення минув';

/**
 * Both routes are public by necessity — the recipient has no account yet. They
 * are rate limited on the same budget as the credential endpoints, because a
 * token is a credential.
 */
@Controller()
export class InvitesController {
  constructor(
    private readonly invites: InvitesService,
    private readonly acceptInvite: AcceptInviteService,
  ) {}

  @Get('invites/:token')
  @Throttle(authThrottle())
  async preview(@Param('token') token: string): Promise<InvitePreview> {
    const lookup = await this.invites.lookup(token);

    if (!lookup.ok) {
      // Expiry is worth telling the recipient, since a fresh link fixes it.
      // Everything else — unknown, already accepted — reports as not found.
      if (lookup.reason === 'expired') {
        throw new GoneException(EXPIRED_MESSAGE);
      }
      throw new NotFoundException();
    }

    return {
      trainerName: lookup.invite.trainer.brandName ?? lookup.invite.trainer.displayName,
      clientFullName: lookup.invite.client.fullName,
      brandLogoUrl: brandLogoUrl(lookup.invite.trainer),
      brandColor: lookup.invite.trainer.brandColor,
    };
  }

  @Post('auth/accept-invite')
  @Throttle(authThrottle())
  @HttpCode(HttpStatus.NO_CONTENT)
  async accept(
    @Body() dto: AcceptInviteDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const { token, expiresAt } = await this.acceptInvite.accept(dto);

    response.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
  }
}
