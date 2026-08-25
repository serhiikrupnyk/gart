import path from 'node:path';

import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '../.env'), quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (testDatabaseUrl === undefined || testDatabaseUrl === '') {
  throw new Error('TEST_DATABASE_URL is not set. See apps/api/.env.example.');
}

// Every application built in a spec resolves DATABASE_URL through PrismaService,
// so redirecting it here is what keeps the suite off the development database.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.WEB_ORIGIN ??= 'http://localhost:3000';
process.env.API_ORIGIN ??= 'http://localhost:4001';
