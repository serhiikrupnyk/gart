import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthSession } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import { toPublicTrainer } from '../trainers/trainer.mapper';
import { toPublicUser } from '../users/user.mapper';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

/** Identical for a wrong password and an unknown email — see {@link AuthService.login}. */
const INVALID_CREDENTIALS_MESSAGE = 'Невірний email або пароль';
const EMAIL_TAKEN_MESSAGE = 'Цей email вже використовується';

const UNIQUE_CONSTRAINT_ERROR = 'P2002';

export interface AuthResult {
  session: AuthSession;
  /** Raw session token for the cookie; never part of a response body. */
  token: string;
  /** Kept in step with the session row so the cookie cannot outlive it. */
  expiresAt: Date;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const passwordHash = await this.passwords.hash(dto.password);

    // A nested create is a single transaction: the trainer cannot exist without
    // its user, and a failure part-way leaves neither behind.
    const user = await this.prisma.user
      .create({
        data: {
          email: dto.email,
          name: dto.displayName,
          passwordHash,
          trainer: { create: { displayName: dto.displayName } },
        },
        include: { trainer: true },
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) {
          // Registration cannot avoid revealing that an email is taken — the
          // user must be told why they cannot proceed. Login, where the leak
          // would actually be exploitable, stays generic.
          throw new ConflictException(EMAIL_TAKEN_MESSAGE);
        }
        throw error;
      });

    if (user.trainer === null) {
      throw new Error('Registration completed without a trainer');
    }

    const { token, expiresAt } = await this.sessions.issue(user.id);

    return {
      token,
      expiresAt,
      session: { user: toPublicUser(user), trainer: toPublicTrainer(user.trainer) },
    };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { trainer: true },
    });

    // Verify against a decoy when no account matched, so that the time taken
    // does not reveal whether the email is registered.
    if (user === null) {
      await this.passwords.verifyDummy(dto.password);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await this.passwords.verify(user.passwordHash, dto.password);

    if (!passwordMatches || user.trainer === null) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const { token, expiresAt } = await this.sessions.issue(user.id);

    return {
      token,
      expiresAt,
      session: { user: toPublicUser(user), trainer: toPublicTrainer(user.trainer) },
    };
  }

  async logout(token: string): Promise<void> {
    await this.sessions.revoke(token);
  }
}
