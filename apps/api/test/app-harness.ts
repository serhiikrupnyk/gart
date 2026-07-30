import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { configureSecurity } from '../src/security';

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  close: () => Promise<void>;
}

/**
 * Boots the real application, configured exactly as `main.ts` configures it.
 *
 * Each spec file gets its own instance so the throttler's in-memory counters
 * never leak between suites.
 */
export async function createHarness(): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  // Silenced because one test deliberately triggers a 500, and Nest would print
  // its stack trace as though something had gone wrong. Assertions are the
  // signal here, not logs.
  const app = moduleRef.createNestApplication({ logger: false });
  configureSecurity(app);
  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    close: async () => {
      await app.close();
    },
  };
}

/** Clears every table between tests. CASCADE also removes dependent sessions. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Session", "Trainer", "User" CASCADE');
}

export const validRegistration = {
  email: 'trainer@gart.fit',
  password: 'correct-horse-battery',
  displayName: 'Олена Ковальчук',
};

/** Pulls the session cookie out of a response so it can be replayed. */
export function sessionCookie(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? (raw as string[]) : [];
  const session = cookies.find((cookie) => cookie.startsWith('gart_session='));

  if (session === undefined) {
    throw new Error('Response did not set a session cookie');
  }

  return session.split(';')[0] ?? '';
}
