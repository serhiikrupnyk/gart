import request from 'supertest';

import type { ExercisePage, PublicExercise } from '@gart/shared';

import {
  createAcceptedClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
  validRegistration,
} from './app-harness';

const NONEXISTENT_ID = 'cl00000000000000000000000';

describe('exercise library', () => {
  let harness: Harness;
  let cookieA: string;
  let cookieB: string;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    cookieA = await registerTrainer(harness, validRegistration);
    cookieB = await registerTrainer(harness, secondRegistration);
  });

  function trainerIdOf(displayName: string): Promise<string> {
    return harness.prisma.trainer
      .findFirstOrThrow({ where: { displayName } })
      .then((trainer) => trainer.id);
  }

  /** Global rows are written the way the seed writes them: trainerId NULL. */
  function createGlobal(name: string, overrides: Record<string, unknown> = {}) {
    return harness.prisma.exercise.create({
      data: { name, primaryMuscleGroup: 'CHEST', muscleGroups: [], ...overrides },
    });
  }

  function createCustom(cookie: string, name: string, overrides: Record<string, unknown> = {}) {
    return request(harness.app.getHttpServer())
      .post('/exercises')
      .set('Cookie', cookie)
      .send({ name, primaryMuscleGroup: 'LEGS', ...overrides })
      .expect(201)
      .then((response) => response.body as PublicExercise);
  }

  function list(cookie: string, query = ''): Promise<ExercisePage> {
    return request(harness.app.getHttpServer())
      .get(`/exercises${query}`)
      .set('Cookie', cookie)
      .expect(200)
      .then((response) => response.body as ExercisePage);
  }

  describe('create', () => {
    it('creates a custom exercise owned by the caller, without exposing the tenant', async () => {
      const created = await createCustom(cookieA, 'Випади', { muscleGroups: ['GLUTES'] });

      expect(created).toMatchObject({
        name: 'Випади',
        primaryMuscleGroup: 'LEGS',
        muscleGroups: ['GLUTES'],
        isCustom: true,
      });
      expect(created).not.toHaveProperty('trainerId');

      const row = await harness.prisma.exercise.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.trainerId).toBe(await trainerIdOf(validRegistration.displayName));
    });

    it('accepts a global or own category, and refuses foreign or unknown ones alike', async () => {
      const globalCategory = await harness.prisma.category.create({ data: { name: 'Сила' } });
      const ownCategory = await harness.prisma.category.create({
        data: { name: 'Моя', trainerId: await trainerIdOf(validRegistration.displayName) },
      });
      const foreignCategory = await harness.prisma.category.create({
        data: { name: 'Чужа', trainerId: await trainerIdOf(secondRegistration.displayName) },
      });

      await createCustom(cookieA, 'З глобальною', { categoryId: globalCategory.id });
      await createCustom(cookieA, 'З власною', { categoryId: ownCategory.id });

      const foreign = await request(harness.app.getHttpServer())
        .post('/exercises')
        .set('Cookie', cookieA)
        .send({ name: 'З чужою', primaryMuscleGroup: 'LEGS', categoryId: foreignCategory.id })
        .expect(400);
      const unknown = await request(harness.app.getHttpServer())
        .post('/exercises')
        .set('Cookie', cookieA)
        .send({ name: 'З неіснуючою', primaryMuscleGroup: 'LEGS', categoryId: NONEXISTENT_ID })
        .expect(400);

      // A foreign category is indistinguishable from a nonexistent one.
      expect(foreign.body).toEqual(unknown.body);
    });

    describe('validation', () => {
      it.each([
        ['a blank name', { name: '   ', primaryMuscleGroup: 'LEGS' }],
        ['an unknown muscle group', { name: 'Вправа', primaryMuscleGroup: 'NECK' }],
        [
          'an unknown secondary group',
          { name: 'Вправа', primaryMuscleGroup: 'LEGS', muscleGroups: ['NECK'] },
        ],
        [
          'an unknown extra property',
          { name: 'Вправа', primaryMuscleGroup: 'LEGS', trainerId: 'hijack' },
        ],
      ])('rejects %s', async (_label, payload) => {
        await request(harness.app.getHttpServer())
          .post('/exercises')
          .set('Cookie', cookieA)
          .send(payload)
          .expect(400);

        expect(await harness.prisma.exercise.count()).toBe(0);
      });
    });
  });

  describe('visibility', () => {
    it('lists the global library plus own customs, never a foreign one', async () => {
      await createGlobal('Жим лежачи');
      await createCustom(cookieA, 'Моя вправа');
      await createCustom(cookieB, 'Чужа вправа');

      const page = await list(cookieA);

      expect(page.total).toBe(2);
      expect(page.items.map((item) => item.name).sort()).toEqual(['Жим лежачи', 'Моя вправа']);
      expect(page.items.find((item) => item.name === 'Жим лежачи')?.isCustom).toBe(false);
      expect(page.items.find((item) => item.name === 'Моя вправа')?.isCustom).toBe(true);
    });

    it('serves a global and an own exercise by id, and hides a foreign one as 404', async () => {
      const globalRow = await createGlobal('Планка');
      const own = await createCustom(cookieA, 'Моя вправа');
      const foreign = await createCustom(cookieB, 'Чужа вправа');

      await request(harness.app.getHttpServer())
        .get(`/exercises/${globalRow.id}`)
        .set('Cookie', cookieA)
        .expect(200);
      await request(harness.app.getHttpServer())
        .get(`/exercises/${own.id}`)
        .set('Cookie', cookieA)
        .expect(200);

      const foreignResponse = await request(harness.app.getHttpServer())
        .get(`/exercises/${foreign.id}`)
        .set('Cookie', cookieA)
        .expect(404);
      const missingResponse = await request(harness.app.getHttpServer())
        .get(`/exercises/${NONEXISTENT_ID}`)
        .set('Cookie', cookieA)
        .expect(404);

      expect(foreignResponse.body).toEqual(missingResponse.body);
    });

    it('rejects a client-context session exactly like no session', async () => {
      const { clientCookie } = await createAcceptedClient(harness, cookieA);

      const withClient = await request(harness.app.getHttpServer())
        .get('/exercises')
        .set('Cookie', clientCookie)
        .expect(401);
      const without = await request(harness.app.getHttpServer()).get('/exercises').expect(401);

      expect(withClient.body).toEqual(without.body);
    });
  });

  describe('filters and pagination', () => {
    it('filters by muscle group across primary and secondary', async () => {
      await createCustom(cookieA, 'Жим', { primaryMuscleGroup: 'CHEST' });
      await createCustom(cookieA, 'Станова', {
        primaryMuscleGroup: 'BACK',
        muscleGroups: ['CHEST'],
      });
      await createCustom(cookieA, 'Присід', { primaryMuscleGroup: 'LEGS' });
      await createCustom(cookieB, 'Чужий жим', { primaryMuscleGroup: 'CHEST' });

      const page = await list(cookieA, '?muscleGroup=CHEST');

      expect(page.items.map((item) => item.name).sort()).toEqual(['Жим', 'Станова']);
    });

    it('filters by category', async () => {
      const category = await harness.prisma.category.create({ data: { name: 'Сила' } });
      await createCustom(cookieA, 'У категорії', { categoryId: category.id });
      await createCustom(cookieA, 'Поза категорією');

      const page = await list(cookieA, `?categoryId=${category.id}`);

      expect(page.items.map((item) => item.name)).toEqual(['У категорії']);
    });

    it('searches by name, case-insensitively, inside the caller’s scope only', async () => {
      await createGlobal('Присідання зі штангою');
      await createCustom(cookieA, 'Присідання на одній нозі');
      await createCustom(cookieB, 'Присідання чужі');

      const page = await list(cookieA, '?search=присідання');

      expect(page.items.map((item) => item.name).sort()).toEqual([
        'Присідання зі штангою',
        'Присідання на одній нозі',
      ]);
    });

    it('rejects an unknown muscle group filter', async () => {
      await request(harness.app.getHttpServer())
        .get('/exercises?muscleGroup=NECK')
        .set('Cookie', cookieA)
        .expect(400);
    });

    it('paginates deterministically', async () => {
      for (const name of ['А-вправа', 'Б-вправа', 'В-вправа', 'Г-вправа', 'Д-вправа']) {
        await createCustom(cookieA, name);
      }

      const first = await list(cookieA, '?page=1&pageSize=2');
      const second = await list(cookieA, '?page=2&pageSize=2');
      const third = await list(cookieA, '?page=3&pageSize=2');

      expect(first.total).toBe(5);
      expect(first.items).toHaveLength(2);
      expect(second.items).toHaveLength(2);
      expect(third.items).toHaveLength(1);

      const seen = [...first.items, ...second.items, ...third.items].map((item) => item.id);
      expect(new Set(seen).size).toBe(5);
    });

    it.each([
      ['page below 1', '?page=0'],
      ['a non-numeric page', '?page=abc'],
      ['pageSize above the cap', '?pageSize=200'],
    ])('rejects %s', async (_label, query) => {
      await request(harness.app.getHttpServer())
        .get(`/exercises${query}`)
        .set('Cookie', cookieA)
        .expect(400);
    });
  });

  describe('mutation rules', () => {
    it('updates an own exercise, clearing nullable fields with null', async () => {
      const own = await createCustom(cookieA, 'Моя вправа', {
        description: 'старий опис',
        textInstructions: 'старі інструкції',
      });

      const response = await request(harness.app.getHttpServer())
        .patch(`/exercises/${own.id}`)
        .set('Cookie', cookieA)
        .send({ name: 'Оновлена', description: null, textInstructions: null })
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Оновлена',
        description: null,
        textInstructions: null,
      });
    });

    it('rejects null for non-nullable fields with a 400, not a 500', async () => {
      const own = await createCustom(cookieA, 'Моя вправа');

      await request(harness.app.getHttpServer())
        .patch(`/exercises/${own.id}`)
        .set('Cookie', cookieA)
        .send({ name: null })
        .expect(400);
    });

    it('refuses to mutate a global exercise and leaves it untouched', async () => {
      const globalRow = await createGlobal('Жим лежачи');

      const patch = await request(harness.app.getHttpServer())
        .patch(`/exercises/${globalRow.id}`)
        .set('Cookie', cookieA)
        .send({ name: 'Захоплено' })
        .expect(404);
      const missing = await request(harness.app.getHttpServer())
        .patch(`/exercises/${NONEXISTENT_ID}`)
        .set('Cookie', cookieA)
        .send({ name: 'Захоплено' })
        .expect(404);
      await request(harness.app.getHttpServer())
        .delete(`/exercises/${globalRow.id}`)
        .set('Cookie', cookieA)
        .expect(404);

      expect(patch.body).toEqual(missing.body);
      const untouched = await harness.prisma.exercise.findUniqueOrThrow({
        where: { id: globalRow.id },
      });
      expect(untouched.name).toBe('Жим лежачи');
    });

    it("refuses to mutate another trainer's exercise and leaves it untouched", async () => {
      const foreign = await createCustom(cookieB, 'Чужа вправа');

      await request(harness.app.getHttpServer())
        .patch(`/exercises/${foreign.id}`)
        .set('Cookie', cookieA)
        .send({ name: 'Викрадено' })
        .expect(404);
      await request(harness.app.getHttpServer())
        .delete(`/exercises/${foreign.id}`)
        .set('Cookie', cookieA)
        .expect(404);

      const untouched = await harness.prisma.exercise.findUniqueOrThrow({
        where: { id: foreign.id },
      });
      expect(untouched.name).toBe('Чужа вправа');
    });

    it('deletes an own exercise', async () => {
      const own = await createCustom(cookieA, 'Тимчасова');

      await request(harness.app.getHttpServer())
        .delete(`/exercises/${own.id}`)
        .set('Cookie', cookieA)
        .expect(204);

      expect(await harness.prisma.exercise.count({ where: { id: own.id } })).toBe(0);
    });
  });
});
