import { Injectable } from '@nestjs/common';

import { generateToken, hashToken } from '../common/token';
import { PrismaService } from '../database/prisma.service';
import { requireEnv } from '../env';
import type { ClientInviteModel, ClientModel, TrainerModel } from '../generated/prisma/models.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteWithContext = ClientInviteModel & {
  client: ClientModel;
  trainer: TrainerModel;
};

/** Why a token cannot be used. Callers translate this into a status code. */
export type InviteRejection = 'expired' | 'unusable';

export type InviteLookup =
  | { readonly ok: true; readonly invite: InviteWithContext }
  | { readonly ok: false; readonly reason: InviteRejection };

interface PrismaWriter {
  clientInvite: PrismaService['clientInvite'];
}

@Injectable()
export class InvitesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issues an invite and returns the link. Any earlier unaccepted invite for the
   * client is deleted first, so regenerating genuinely invalidates the old link:
   * its hash no longer exists, making it indistinguishable from one never issued.
   *
   * Accepts a transaction client so client creation and its first invite commit
   * together.
   */
  async issue(writer: PrismaWriter, trainerId: string, clientId: string): Promise<string> {
    await writer.clientInvite.deleteMany({ where: { clientId, acceptedAt: null } });

    const token = generateToken();

    await writer.clientInvite.create({
      data: {
        trainerId,
        clientId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    return buildInviteUrl(token);
  }

  /**
   * Resolves a raw token. Distinguishes expiry from every other failure — the
   * recipient of a stale link benefits from being told it has run out, whereas
   * an already-accepted or unknown token reports as simply not found, so a used
   * token looks exactly like one that never existed.
   */
  async lookup(token: string): Promise<InviteLookup> {
    const invite = await this.prisma.clientInvite.findFirst({
      where: { tokenHash: hashToken(token) },
      include: { client: true, trainer: true },
    });

    if (invite === null || invite.acceptedAt !== null) {
      return { ok: false, reason: 'unusable' };
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' };
    }

    return { ok: true, invite };
  }
}

function buildInviteUrl(token: string): string {
  return `${requireEnv('WEB_ORIGIN')}/invite/${token}`;
}
