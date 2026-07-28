import 'dotenv/config';

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
    // Pre-created by the Postgres init script and owned by the app role, so
    // `migrate dev` works without granting that role CREATEDB.
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
});
