import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthSession } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import { startTrial } from '../payments/trial';
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

    // An explicit transaction rather than a nested create: the OWNER membership
    // needs the ids of both the user and the trainer, neither of which exists
    // until the other statement has run. All four rows commit together or none
    // of them do — the trial included, because a trainer without a subscription
    // row is one the access rule cannot answer for, and a follow-up write that
    // failed would lock somebody out of their own first screen.
    const { user, trainer } = await this.prisma
      .$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: { email: dto.email, name: dto.displayName, passwordHash },
        });

        const createdTrainer = await tx.trainer.create({
          data: { userId: createdUser.id, displayName: dto.displayName },
        });

        // Every tenant has exactly one owner, from the moment it exists.
        await tx.teamMember.create({
          data: { trainerId: createdTrainer.id, userId: createdUser.id, role: 'OWNER' },
        });

        // The free trial. No card is taken and no charge is ever scheduled, so
        // this cannot become a payment by accident later.
        await startTrial(tx, createdTrainer.id, new Date());

        return { user: createdUser, trainer: createdTrainer };
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

    const { token, expiresAt } = await this.sessions.issueTrainerSession(user.id);

    return {
      token,
      expiresAt,
      session: { user: toPublicUser(user), trainer: toPublicTrainer(trainer) },
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

    const { token, expiresAt } = await this.sessions.issueTrainerSession(user.id);

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
