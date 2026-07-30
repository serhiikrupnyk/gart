import request from 'supertest';

import type { PublicCategory } from '@gart/shared';

import {
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
  validRegistration,
} from './app-harness';

const NONEXISTENT_ID = 'cl00000000000000000000000';

describe('exercise categories', () => {
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

  function create(cookie: string, name: string): Promise<PublicCategory> {
    return request(harness.app.getHttpServer())
      .post('/categories')
      .set('Cookie', cookie)
      .send({ name })
      .expect(201)
      .then((response) => response.body as PublicCategory);
  }

  it('lists globals plus own customs, never a foreign one', async () => {
    await harness.prisma.category.create({ data: { name: 'Сила' } });
    await create(cookieA, 'Моя категорія');
    await create(cookieB, 'Чужа категорія');

    const response = await request(harness.app.getHttpServer())
      .get('/categories')
      .set('Cookie', cookieA)
      .expect(200);

    const categories = response.body as PublicCategory[];
    expect(categories.map((category) => category.name).sort()).toEqual(['Моя категорія', 'Сила']);
    expect(categories.find((category) => category.name === 'Сила')?.isCustom).toBe(false);
    expect(categories.find((category) => category.name === 'Моя категорія')?.isCustom).toBe(true);
  });

  it('rejects a duplicate name within the same trainer, allows shadowing a global', async () => {
    await harness.prisma.category.create({ data: { name: 'Сила' } });
    await create(cookieA, 'Моя категорія');

    const duplicate = await request(harness.app.getHttpServer())
      .post('/categories')
      .set('Cookie', cookieA)
      .send({ name: 'Моя категорія' })
      .expect(409);
    expect(duplicate.body).toMatchObject({ message: 'Категорія з такою назвою вже існує' });

    // Shadowing the global name is fine; so is the same name for another trainer.
    await create(cookieA, 'Сила');
    await create(cookieB, 'Моя категорія');
  });

  it('renames an own category, and only an own one', async () => {
    const own = await create(cookieA, 'Стара назва');
    const globalRow = await harness.prisma.category.create({ data: { name: 'Сила' } });
    const foreign = await create(cookieB, 'Чужа');

    await request(harness.app.getHttpServer())
      .patch(`/categories/${own.id}`)
      .set('Cookie', cookieA)
      .send({ name: 'Нова назва' })
      .expect(200);

    for (const id of [globalRow.id, foreign.id, NONEXISTENT_ID]) {
      await request(harness.app.getHttpServer())
        .patch(`/categories/${id}`)
        .set('Cookie', cookieA)
        .send({ name: 'Захоплено' })
        .expect(404);
    }

    expect(
      (await harness.prisma.category.findUniqueOrThrow({ where: { id: globalRow.id } })).name,
    ).toBe('Сила');
    expect(
      (await harness.prisma.category.findUniqueOrThrow({ where: { id: foreign.id } })).name,
    ).toBe('Чужа');
  });

  it('deletes an own category and uncategorises its exercises', async () => {
    const own = await create(cookieA, 'Тимчасова');
    const exercise = await request(harness.app.getHttpServer())
      .post('/exercises')
      .set('Cookie', cookieA)
      .send({ name: 'Вправа', primaryMuscleGroup: 'LEGS', categoryId: own.id })
      .expect(201)
      .then((response) => (response.body as { id: string }).id);

    await request(harness.app.getHttpServer())
      .delete(`/categories/${own.id}`)
      .set('Cookie', cookieA)
      .expect(204);

    const orphaned = await harness.prisma.exercise.findUniqueOrThrow({ where: { id: exercise } });
    expect(orphaned.categoryId).toBeNull();
  });

  it('refuses to delete a global category', async () => {
    const globalRow = await harness.prisma.category.create({ data: { name: 'Сила' } });

    await request(harness.app.getHttpServer())
      .delete(`/categories/${globalRow.id}`)
      .set('Cookie', cookieA)
      .expect(404);

    expect(await harness.prisma.category.count({ where: { id: globalRow.id } })).toBe(1);
  });

  it('serves the muscle-group vocabulary with Ukrainian labels', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/muscle-groups')
      .set('Cookie', cookieA)
      .expect(200);

    const options = response.body as { value: string; label: string }[];
    expect(options).toHaveLength(9);
    expect(options).toContainEqual({ value: 'CHEST', label: 'Груди' });
    expect(options).toContainEqual({ value: 'FULL_BODY', label: 'Все тіло' });

    await request(harness.app.getHttpServer()).get('/muscle-groups').expect(401);
  });
});
