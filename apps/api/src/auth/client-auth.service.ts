import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { ClientSession } from '@gart/shared';

import { toPublicClient } from '../clients/client.mapper';
import { PrismaService } from '../database/prisma.service';
import { toTrainerBrand } from '../trainers/trainer.mapper';
import type { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

/**
 * One message for every failure mode — unknown email, wrong password, and a
 * perfectly valid account that simply is nobody's client. That last case
 * matters: this endpoint must not become an oracle for "is this address a
 * trainer?" any more than login may reveal "is this address registered?".
 */
const INVALID_CREDENTIALS_MESSAGE = 'Невірний email або пароль';

export interface ClientAuthResult {
  session: ClientSession;
  /** Raw session token for the cookie; never part of a response body. */
  token: string;
  expiresAt: Date;
}

@Injectable()
export class ClientAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  async login(dto: LoginDto): Promise<ClientAuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Verify against a decoy when no account matched, so response time does not
    // reveal whether the email is registered — same defence as trainer login.
    if (user === null) {
      await this.passwords.verifyDummy(dto.password);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await this.passwords.verify(user.passwordHash, dto.password);

    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // Today a user has at most one client profile (accept-invite refuses
    // existing accounts); when multi-trainer linking lands, choosing between
    // several profiles happens here — the session binds to exactly one.
    const client = await this.prisma.client.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: { trainer: true },
    });

    if (client === null) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const { token, expiresAt } = await this.sessions.issueClientSession(user.id, client.id);

    return {
      token,
      expiresAt,
      session: { client: toPublicClient(client), trainer: toTrainerBrand(client.trainer) },
    };
  }
}
