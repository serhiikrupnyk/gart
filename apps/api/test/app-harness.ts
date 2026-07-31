import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ClientWithInvite, PublicClient } from '@gart/shared';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { configureSecurity } from '../src/security';
import { StorageService } from '../src/storage/storage.service';
import { FakeStorage } from './fake-storage';

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  /** Bound to the StorageService token — no test ever needs a real bucket. */
  storage: FakeStorage;
  close: () => Promise<void>;
}

/**
 * Boots the real application, configured exactly as `main.ts` configures it.
 *
 * Each spec file gets its own instance so the throttler's in-memory counters
 * never leak between suites.
 */
export async function createHarness(): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue(new FakeStorage())
    .compile();

  // Silenced because one test deliberately triggers a 500, and Nest would print
  // its stack trace as though something had gone wrong. Assertions are the
  // signal here, not logs.
  const app = moduleRef.createNestApplication({ logger: false });
  configureSecurity(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const storage = app.get(StorageService) as FakeStorage;

  return {
    app,
    prisma,
    storage,
    close: async () => {
      await app.close();
    },
  };
}

/** Clears every table between tests. CASCADE also removes dependent rows. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AssignmentExercise", "AssignmentSection", "Assignment", "ProgramExercise", "ProgramSection", "Program", "Exercise", "Category", "ClientInvite", "Client", "TeamMember", "Session", "Trainer", "User" CASCADE',
  );
}

export const validRegistration = {
  email: 'trainer@gart.fit',
  password: 'correct-horse-battery',
  displayName: 'Олена Ковальчук',
};

export const secondRegistration = {
  email: 'other-trainer@gart.fit',
  password: 'correct-horse-battery',
  displayName: 'Іван Мельник',
};

/** Registers a trainer and returns their session cookie. */
export async function registerTrainer(
  harness: Harness,
  registration: typeof validRegistration = validRegistration,
): Promise<string> {
  const response = await request(harness.app.getHttpServer())
    .post('/auth/register')
    .send(registration)
    .expect(201);

  return sessionCookie(response.headers as Record<string, unknown>);
}

/** Creates a client for the trainer holding `cookie`, returning it and its invite. */
export async function createClient(
  harness: Harness,
  cookie: string,
  overrides: Partial<{ fullName: string; email: string }> = {},
): Promise<{ client: PublicClient; inviteUrl: string; token: string }> {
  const response = await request(harness.app.getHttpServer())
    .post('/clients')
    .set('Cookie', cookie)
    .send({ fullName: 'Марія Бондаренко', email: 'maria@example.com', ...overrides })
    .expect(201);

  const body = response.body as ClientWithInvite;

  return { ...body, token: tokenFromInviteUrl(body.inviteUrl) };
}

export const CLIENT_PASSWORD = 'client-password-1';

/**
 * Registers a trainer, creates a client and accepts the invite — the full path
 * to an ACTIVE client with an account. Returns the client-context cookie along
 * with everything needed to log in again later.
 */
export async function createAcceptedClient(
  harness: Harness,
  trainerCookie: string,
  overrides: Partial<{ fullName: string; email: string }> = {},
): Promise<{ clientCookie: string; clientId: string; email: string }> {
  const { client, token } = await createClient(harness, trainerCookie, overrides);

  const accepted = await request(harness.app.getHttpServer())
    .post('/auth/accept-invite')
    .send({ token, password: CLIENT_PASSWORD })
    .expect(204);

  return {
    clientCookie: sessionCookie(accepted.headers as Record<string, unknown>),
    clientId: client.id,
    email: client.email,
  };
}

export function tokenFromInviteUrl(inviteUrl: string): string {
  const token = inviteUrl.split('/invite/')[1];

  if (token === undefined || token.length === 0) {
    throw new Error(`Invite URL had no token: ${inviteUrl}`);
  }

  return token;
}

/** Supertest types `headers` loosely; these two helpers read it without casts. */
type ResponseHeaders = Record<string, unknown>;

/** Every Set-Cookie directive as one string, for asserting flags. */
export function setCookieHeader(headers: ResponseHeaders): string {
  const raw = headers['set-cookie'];

  if (Array.isArray(raw)) {
    return raw.join(';');
  }

  return typeof raw === 'string' ? raw : '';
}

/** Pulls the session cookie out of a response so it can be replayed. */
export function sessionCookie(headers: ResponseHeaders): string {
  const raw = headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : [];
  const session = cookies.find((cookie) => cookie.startsWith('gart_session='));

  if (session === undefined) {
    throw new Error('Response did not set a session cookie');
  }

  return session.split(';')[0] ?? '';
}
