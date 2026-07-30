import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../database/prisma.service';
import type { AcceptInviteDto } from './dto/accept-invite.dto';
import { InvitesService } from './invites.service';

/**
 * One message for every failure mode — unknown, expired, already used, or an
 * email that already has an account. Same principle as login: the page tells the
 * recipient to ask their trainer for a fresh link, and nothing more.
 */
const INVITE_UNUSABLE_MESSAGE = 'Це запрошення недійсне або вже використане';

export interface AcceptedInvite {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AcceptInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InvitesService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  async accept(dto: AcceptInviteDto): Promise<AcceptedInvite> {
    const lookup = await this.invites.lookup(dto.token);

    if (!lookup.ok) {
      throw new UnauthorizedException(INVITE_UNUSABLE_MESSAGE);
    }

    const { invite } = lookup;

    // Refuse rather than reuse. Were we to link an existing account here, an
    // invite addressed to someone who already has one would let the sender
    // overwrite their password — an account takeover. Linking a second trainer
    // to an existing client needs them to be signed in, which arrives with
    // client login.
    const existing = await this.prisma.user.findUnique({ where: { email: invite.client.email } });

    if (existing !== null) {
      throw new UnauthorizedException(INVITE_UNUSABLE_MESSAGE);
    }

    const passwordHash = await this.passwords.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: invite.client.email,
          name: invite.client.fullName,
          passwordHash,
        },
      });

      await tx.client.update({
        where: { id: invite.clientId },
        data: { userId: createdUser.id, status: 'ACTIVE' },
      });

      // Scoped by id AND acceptedAt: if two requests race, only the one that
      // still sees the invite unaccepted updates a row.
      const consumed = await tx.clientInvite.updateMany({
        where: { id: invite.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });

      if (consumed.count !== 1) {
        throw new UnauthorizedException(INVITE_UNUSABLE_MESSAGE);
      }

      return createdUser;
    });

    // The invite names the client profile, so the session binds to it — the
    // recipient lands in the client app wearing exactly one, unambiguous hat.
    return this.sessions.issueClientSession(user.id, invite.clientId);
  }
}
