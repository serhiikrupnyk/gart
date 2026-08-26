import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import type { MuscleGroup } from '@gart/shared';

import { ARGON2_OPTIONS } from '../src/auth/argon2-options';
import { requireEnv } from '../src/env';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { startTrial } from '../src/payments/trial.js';
import { toPublicTrainer } from '../src/trainers/trainer.mapper.js';
import { toPublicUser } from '../src/users/user.mapper.js';

const DEMO_EMAIL = 'demo@gart.fit';
const DEMO_NAME = 'Демо Тренер';

const GLOBAL_CATEGORIES = ['Сила', 'Кардіо', 'Розтяжка', 'Функціональні', 'Мобільність'];

/**
 * A handful of common exercises so the global library is visible in dev. The
 * full Ukrainian base set is a separate Phase 1 content task.
 */
const GLOBAL_EXERCISES: {
  name: string;
  primaryMuscleGroup: MuscleGroup;
  muscleGroups: MuscleGroup[];
}[] = [
  { name: 'Присідання зі штангою', primaryMuscleGroup: 'LEGS', muscleGroups: ['GLUTES', 'CORE'] },
  { name: 'Станова тяга', primaryMuscleGroup: 'BACK', muscleGroups: ['LEGS', 'GLUTES', 'CORE'] },
  { name: 'Жим лежачи', primaryMuscleGroup: 'CHEST', muscleGroups: ['SHOULDERS', 'ARMS'] },
  { name: 'Підтягування', primaryMuscleGroup: 'BACK', muscleGroups: ['ARMS'] },
  { name: 'Віджимання', primaryMuscleGroup: 'CHEST', muscleGroups: ['SHOULDERS', 'ARMS', 'CORE'] },
  { name: 'Планка', primaryMuscleGroup: 'CORE', muscleGroups: ['SHOULDERS', 'GLUTES'] },
];

type Seeder = InstanceType<typeof PrismaClient>;

/**
 * Global rows have trainerId NULL, which Postgres unique indexes treat as
 * distinct — so the seed cannot upsert and instead is the sole writer of
 * globals, enforcing their uniqueness by name lookup. Idempotent either way.
 */
async function seedGlobalLibrary(prisma: Seeder): Promise<void> {
  for (const name of GLOBAL_CATEGORIES) {
    const existing = await prisma.category.findFirst({ where: { trainerId: null, name } });

    if (existing === null) {
      await prisma.category.create({ data: { name } });
    }
  }

  const strength = await prisma.category.findFirstOrThrow({
    where: { trainerId: null, name: 'Сила' },
  });

  for (const exercise of GLOBAL_EXERCISES) {
    const existing = await prisma.exercise.findFirst({
      where: { trainerId: null, name: exercise.name },
    });

    if (existing === null) {
      await prisma.exercise.create({ data: { ...exercise, categoryId: strength.id } });
    }
  }
}

/**
 * Creates the demo trainer and the global exercise library. Idempotent: safe to
 * re-run after every migration.
 */
async function seed(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }),
  });

  const passwordHash = await hash(requireEnv('SEED_DEMO_PASSWORD'), ARGON2_OPTIONS);

  try {
    const user = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      update: { name: DEMO_NAME, passwordHash },
      create: { email: DEMO_EMAIL, name: DEMO_NAME, passwordHash },
    });

    const trainer = await prisma.trainer.upsert({
      where: { userId: user.id },
      update: { displayName: DEMO_NAME },
      create: { userId: user.id, displayName: DEMO_NAME },
    });

    // The same free trial a real registration starts, so the billing screens
    // have something true to show in development. Left alone if one already
    // exists: re-seeding must not reset a trial somebody is working against.
    if ((await prisma.subscription.findUnique({ where: { trainerId: trainer.id } })) === null) {
      await startTrial(prisma, trainer.id, new Date());
    }

    await seedGlobalLibrary(prisma);

    console.log('Seeded demo trainer:', {
      user: toPublicUser(user),
      trainer: toPublicTrainer(trainer),
    });
    console.log(
      `Seeded global library: ${String(GLOBAL_CATEGORIES.length)} categories, ${String(GLOBAL_EXERCISES.length)} exercises`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
