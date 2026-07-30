import { Injectable } from '@nestjs/common';

import { generateToken, hashToken } from '../common/token';
import { PrismaService } from '../database/prisma.service';
import type { SessionModel, TrainerModel, UserModel } from '../generated/prisma/models.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export type SessionWithTenant = SessionModel & {
  user: UserModel & { trainer: TrainerModel | null };
};

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Issues a session. The returned token is the only copy that ever leaves here. */
  async issue(userId: string): Promise<IssuedSession> {
    const token = generateToken();
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
