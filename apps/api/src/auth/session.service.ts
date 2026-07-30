import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { SessionModel, TrainerModel, UserModel } from '../generated/prisma/models.js';

const TOKEN_BYTES = 32;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export type SessionWithTenant = SessionModel & {
  user: UserModel & { trainer: TrainerModel | null };
};

/**
 * Only the SHA-256 of a session token is stored, so a database leak yields no
 * usable sessions. SHA-256 rather than argon2 is deliberate: the token is 256
 * bits of CSPRNG output, so there is nothing to brute-force, and lookups need to
 * be a single indexed query.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Issues a session. The returned token is the only copy that ever leaves here. */
  async issue(userId: string): Promise<IssuedSession> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.session.create({
      data: { userId, tokenHash: hashToken(token), expiresAt },
    });

    return { token, expiresAt };
  }

  async findValid(token: string): Promise<SessionWithTenant | null> {
    return this.prisma.session.findFirst({
      where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
      include: { user: { include: { trainer: true } } },
    });
  }

  /** Revokes a session server-side; a replayed cookie stops working immediately. */
  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
}
