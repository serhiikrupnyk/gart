import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import type { MuscleGroup } from '@gart/shared';

import { ARGON2_OPTIONS } from '../src/auth/argon2-options';
import { requireEnv } from '../src/env';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { startTrial } from '../src/payments/trial.js';
import { addDays } from '../src/common/calendar.js';
import { TRIAL_DAYS } from '@gart/shared';
// Runtime imports from @gart/shared, so the seed is checked by the SAME rules
// the API enforces. That makes `db:seed` depend on shared being built, which
// turbo.json now declares — run it through `pnpm db:seed` at the root.
import { GLOBAL_FOODS } from './global-foods';
import { validateNutrients, validatePortions } from '../src/nutrition/nutrients.validation.js';
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
 * The global food library.
 *
 * Every row is put through the SAME validation a trainer's own entry faces —
 * physical bounds and the Atwater sanity band — so the shared library cannot
 * hold a profile the API would refuse from anybody else. A seed that bypassed
 * its own rules would be the first place bad data got in.
 *
 * Idempotent by name: re-running after a migration adds what is missing and
 * leaves the rest, so a developer's own edits to a global row survive.
 */
async function seedGlobalFoods(prisma: Seeder): Promise<void> {
  let created = 0;

  for (const food of GLOBAL_FOODS) {
    const nutrients = {
      kcal: food.kcal,
      protein: food.protein,
      fat: food.fat,
      carbs: food.carbs,
      fibre: food.fibre ?? null,
      sugars: food.sugars ?? null,
      saturatedFat: food.saturatedFat ?? null,
      salt: food.salt ?? null,
    };

    validateNutrients(nutrients);
    validatePortions(food.portions ?? []);

    const existing = await prisma.food.findFirst({ where: { trainerId: null, name: food.name } });

    if (existing !== null) {
      continue;
    }

    created += 1;
    await prisma.food.create({
      data: {
        name: food.name,
        group: food.group,
        kcal: food.kcal,
        protein: food.protein,
        fat: food.fat,
        carbs: food.carbs,
        fibre: food.fibre ?? null,
        sugars: food.sugars ?? null,
        saturatedFat: food.saturatedFat ?? null,
        salt: food.salt ?? null,
        source: food.source,
        portions: { create: (food.portions ?? []).map((portion) => ({ ...portion })) },
      },
    });
  }

  // What this run actually did, not what the file contains. Re-seeding after a
  // migration usually creates nothing, and saying «75» either way is a log line
  // that cannot be believed.
  console.log(
    `Global foods: ${String(created)} created, ${String(GLOBAL_FOODS.length - created)} already present`,
  );
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

      // ...then put the demo trainer on GROW.
      //
      // The trial runs on PRO, which does not include nutrition — so a freshly
      // seeded developer could not see the food library that IS this step,
      // and would land on the upsell instead. Only ever applied to the brand
      // new trial, so a developer's own plan changes survive re-seeding.
      const endsAt = addDays(new Date(), TRIAL_DAYS);

      await prisma.subscription.update({
        where: { trainerId: trainer.id },
        data: {
          plan: 'GROW',
          status: 'ACTIVE',
          currentPeriodEnd: endsAt,
          accessUntil: endsAt,
          nextChargeAt: null,
        },
      });
    }

    await seedGlobalLibrary(prisma);
    await seedGlobalFoods(prisma);

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
