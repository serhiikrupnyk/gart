import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

/**
 * Brings the test database up to the current migrations once per run.
 *
 * `migrate deploy` rather than `migrate dev`: it never prompts, never reaches
 * for a shadow database, and is the same command a deployment would use.
 */
export default function globalSetup(): void {
  loadEnv({ path: path.resolve(__dirname, '../.env'), quiet: true });

  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (testDatabaseUrl === undefined || testDatabaseUrl === '') {
    throw new Error('TEST_DATABASE_URL is not set. See apps/api/.env.example.');
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '..'),
    // Point Prisma at the test database, never the development one.
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'inherit',
  });
}
