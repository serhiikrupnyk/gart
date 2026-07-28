import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { requireEnv } from '../src/env';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { toPublicTrainer } from '../src/trainers/trainer.mapper.js';
import { toPublicUser } from '../src/users/user.mapper.js';

const DEMO_EMAIL = 'demo@gart.fit';
const DEMO_NAME = 'Демо Тренер';

/**
 * Creates the single demo trainer. Idempotent: both writes are upserts keyed on
 * a unique column, so re-running updates in place instead of duplicating.
 */
async function seed(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }),
  });

  try {
    const user = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      update: { name: DEMO_NAME },
      create: { email: DEMO_EMAIL, name: DEMO_NAME },
    });

    const trainer = await prisma.trainer.upsert({
      where: { userId: user.id },
      update: { displayName: DEMO_NAME },
      create: { userId: user.id, displayName: DEMO_NAME },
    });

    console.log('Seeded demo trainer:', {
      user: toPublicUser(user),
      trainer: toPublicTrainer(trainer),
    });
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
