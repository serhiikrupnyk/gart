import { Injectable } from '@nestjs/common';

import { generateToken, hashToken } from '../common/token';
import { PrismaService } from '../database/prisma.service';
import type {
  ClientModel,
  SessionModel,
  TrainerModel,
  UserModel,
} from '../generated/prisma/models.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

/**
 * A valid session with everything either guard could need: the user (plus their
 * trainer, for TRAINER context) and the bound client with its owning trainer
 * (for CLIENT context). One query serves both.
 */
export type SessionPrincipal = SessionModel & {
  user: UserModel & { trainer: TrainerModel | null };
  client: (ClientModel & { trainer: TrainerModel }) | null;
};

/**
 * Sessions are issued through two deliberately separate methods — there is no
 * way to construct one without stating whose hat it is, and the database CHECK
 * (context=CLIENT ⇔ clientId set) backs that up against any future mistake.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** The returned token is the only copy that ever leaves this module. */
  async issueTrainerSession(userId: string): Promise<IssuedSession> {
    return this.issue({ userId, context: 'TRAINER' });
  }

  /**
   * Bound to one Client row: that fixes the tenant for the session's lifetime,
   * and makes multi-trainer support later a matter of issuing a new session for
   * a different client profile — not of reinterpreting this one.
   */
  async issueClientSession(userId: string, clientId: string): Promise<IssuedSession> {
    return this.issue({ userId, context: 'CLIENT', clientId });
  }

  async findValid(token: string): Promise<SessionPrincipal | null> {
    return this.prisma.session.findFirst({
      where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
      include: {
        user: { include: { trainer: true } },
        client: { include: { trainer: true } },
      },
    });
  }

  /** Revokes a session server-side regardless of context; replay stops working. */
  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  private async issue(data: {
    userId: string;
    context: 'TRAINER' | 'CLIENT';
    clientId?: string;
  }): Promise<IssuedSession> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.session.create({
      data: { ...data, tokenHash: hashToken(token), expiresAt },
    });

    return { token, expiresAt };
  }
}
