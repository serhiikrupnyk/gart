import type { MealPage, PublicMeal, PublicMealPlan } from '@gart/shared';
import request from 'supertest';

import {
  createGlobalFood,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
  subscribeToGrow,
  trainerIdFor,
  validRegistration,
} from './app-harness';

let harness: Harness;

beforeAll(async () => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
  harness = await createHarness();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await resetDatabase(harness.prisma);
});

const server = () => harness.app.getHttpServer();

async function growTrainer(
  registration: typeof validRegistration = validRegistration,
): Promise<string> {
  const cookie = await registerTrainer(harness, registration);
  await subscribeToGrow(harness, await trainerIdFor(harness, registration.email));

  return cookie;
}

async function addMeal(cookie: string, body: Record<string, unknown>): Promise<PublicMeal> {
  const response = await request(server())
    .post('/nutrition/meals')
    .set('Cookie', cookie)
    .send(body)
    .expect(201);

  return response.body as PublicMeal;
}

describe('meal totals', () => {
  it('are computed exactly from the per-100 g profiles', async () => {
    const cookie = await growTrainer();
    // 100 kcal / 10 P / 5 F / 5 C per 100 g, so 80 g is exactly 80/8/4/4.
    const foodA = await createGlobalFood(harness, { name: 'Продукт А' });
    // 200 kcal / 20 / 10 / 10 per 100 g, so 55 g is 110/11/5.5/5.5.
    const foodB = await createGlobalFood(harness, {
      name: 'Продукт Б',
      kcal: '200.00',
      protein: '20.00',
      fat: '10.00',
      carbs: '10.00',
    });

    const meal = await addMeal(cookie, {
      name: 'Тестова страва',
      items: [
        { foodId: foodA, grams: '80.00' },
        { foodId: foodB, grams: '55.00' },
      ],
    });

    expect(meal.items[0]?.nutrients).toMatchObject({ kcal: '80.00', protein: '8.00' });
    expect(meal.items[1]?.nutrients).toMatchObject({ kcal: '110.00', protein: '11.00' });

    // 80 + 110 = 190.00, asserted as a string — a float would have produced
    // 190.00000000000003 somewhere along the way.
    expect(meal.nutrients).toMatchObject({
      kcal: '190.00',
      protein: '19.00',
      fat: '9.50',
      carbs: '9.50',
    });
  });

  it('compose identically whether written in grams or as a portion', async () => {
    const cookie = await growTrainer();
    const foodId = await createGlobalFood(harness);

    const plain = await addMeal(cookie, {
      name: 'У грамах',
      items: [{ foodId, grams: '110.00' }],
    });
    const expressed = await addMeal(cookie, {
      name: 'У порціях',
      items: [{ foodId, grams: '110.00', portionLabel: 'яйце середнє', portionCount: '2.00' }],
    });

    // The portion fields record how it was WRITTEN and take no part in any
    // total, which is what makes renaming a portion later harmless.
    expect(expressed.nutrients).toEqual(plain.nutrients);
    expect(expressed.items[0]?.portionLabel).toBe('яйце середнє');
    expect(expressed.items[0]?.portionCount).toBe('2.00');
  });

  it('report an unmeasured nutrient as unmeasured, not as zero', async () => {
    const cookie = await growTrainer();
    const known = await createGlobalFood(harness, { name: 'Відомий' });
    const unmeasured = await createGlobalFood(harness, { name: 'Невідомий', fibre: null });

    const meal = await addMeal(cookie, {
      name: 'Змішана',
      items: [
        { foodId: known, grams: '100.00' },
        { foodId: unmeasured, grams: '100.00' },
      ],
    });

    // «unknown + 5» is unknown. Reporting 1.00 would silently omit whatever
    // nobody measured from a day's total.
    expect(meal.nutrients.fibre).toBeNull();
    expect(meal.nutrients.kcal).toBe('200.00');
  });

  it('are DERIVED, so correcting a food corrects every meal that uses it', async () => {
    const cookie = await growTrainer();
    const foodId = await createGlobalFood(harness);

    const meal = await addMeal(cookie, {
      name: 'Страва',
      items: [{ foodId, grams: '100.00' }],
    });
    expect(meal.nutrients.kcal).toBe('100.00');

    await harness.prisma.food.update({ where: { id: foodId }, data: { kcal: '120.00' } });

    const reread = await request(server())
      .get(`/nutrition/meals/${meal.id}`)
      .set('Cookie', cookie)
      .expect(200);

    // A stored total would be stale here, and Step 29 exists so that
    // correcting a food is a normal thing to do.
    expect((reread.body as PublicMeal).nutrients.kcal).toBe('120.00');
  });
});

describe('meal ownership', () => {
  it("makes another trainer's meal a byte-identical 404", async () => {
    const first = await growTrainer();
    const second = await growTrainer(secondRegistration);
    const foodId = await createGlobalFood(harness);
    const mine = await addMeal(first, { name: 'Моя страва', items: [{ foodId, grams: '100.00' }] });

    const foreign = await request(server())
      .get(`/nutrition/meals/${mine.id}`)
      .set('Cookie', second);
    const missing = await request(server())
      .get('/nutrition/meals/clzzzzzzzzzzzzzzzzzzzzzz')
      .set('Cookie', second);

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);

    await request(server())
      .patch(`/nutrition/meals/${mine.id}`)
      .set('Cookie', second)
      .send({ name: 'Викрадено' })
      .expect(404);
    await request(server()).delete(`/nutrition/meals/${mine.id}`).set('Cookie', second).expect(404);

    const untouched = await harness.prisma.meal.findFirstOrThrow({ where: { id: mine.id } });
    expect(untouched.name).toBe('Моя страва');
  });

  it("never lists another trainer's meals", async () => {
    const first = await growTrainer();
    const second = await growTrainer(secondRegistration);
    const foodId = await createGlobalFood(harness);
    await addMeal(first, { name: 'Моя страва', items: [{ foodId, grams: '100.00' }] });

    const list = await request(server()).get('/nutrition/meals').set('Cookie', second).expect(200);
    expect((list.body as MealPage).total).toBe(0);
  });

  it("refuses a food that is neither global nor the trainer's own", async () => {
    const first = await growTrainer();
    const second = await growTrainer(secondRegistration);

    const theirFood = await request(server())
      .post('/nutrition/foods')
      .set('Cookie', second)
      .send({
        name: 'Їхній продукт',
        group: 'OTHER',
        nutrients: { kcal: '100.00', protein: '10.00', fat: '5.00', carbs: '5.00' },
      })
      .expect(201);

    // 400 and not 404: the record in question is fine, the request body is
    // not — the exercise library's rule, unchanged.
    const refused = await request(server())
      .post('/nutrition/meals')
      .set('Cookie', first)
      .send({
        name: 'Чужий продукт',
        items: [{ foodId: (theirFood.body as { id: string }).id, grams: '100.00' }],
      })
      .expect(400);

    expect((refused.body as { message: string }).message).toContain('базі');
    expect(await harness.prisma.meal.count()).toBe(0);
  });
});

describe('referential guards', () => {
  it('refuses to delete a food a meal still uses', async () => {
    const cookie = await growTrainer();

    const own = await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send({
        name: 'Мій продукт',
        group: 'OTHER',
        nutrients: { kcal: '100.00', protein: '10.00', fat: '5.00', carbs: '5.00' },
      })
      .expect(201);
    const foodId = (own.body as { id: string }).id;

    await addMeal(cookie, { name: 'Страва', items: [{ foodId, grams: '100.00' }] });

    await request(server()).delete(`/nutrition/foods/${foodId}`).set('Cookie', cookie).expect(409);
    expect(await harness.prisma.food.count({ where: { id: foodId } })).toBe(1);
  });

  it('refuses to delete a meal a plan still uses', async () => {
    const cookie = await growTrainer();
    const foodId = await createGlobalFood(harness);
    const meal = await addMeal(cookie, { name: 'Страва', items: [{ foodId, grams: '100.00' }] });

    await request(server())
      .post('/nutrition/plans')
      .set('Cookie', cookie)
      .send({ name: 'План', slots: [{ slot: 'BREAKFAST', mealId: meal.id }] })
      .expect(201);

    const refused = await request(server())
      .delete(`/nutrition/meals/${meal.id}`)
      .set('Cookie', cookie)
      .expect(409);

    expect((refused.body as { message: string }).message).toContain('план');
    expect(await harness.prisma.meal.count({ where: { id: meal.id } })).toBe(1);
  });
});

describe('plans', () => {
  async function planWith(cookie: string, servings?: string): Promise<PublicMealPlan> {
    const foodId = await createGlobalFood(harness);
    const meal = await addMeal(cookie, {
      name: 'Вівсянка',
      items: [{ foodId, grams: '100.00' }],
    });

    const response = await request(server())
      .post('/nutrition/plans')
      .set('Cookie', cookie)
      .send({
        name: 'День',
        targets: { kcal: '2000.00', protein: '150.00', fat: '60.00', carbs: '210.00' },
        slots: [
          { slot: 'BREAKFAST', mealId: meal.id, ...(servings === undefined ? {} : { servings }) },
        ],
      })
      .expect(201);

    return response.body as PublicMealPlan;
  }

  it('sum their slots, and servings multiply exactly', async () => {
    const cookie = await growTrainer();

    const plain = await planWith(cookie);
    expect(plain.slots[0]?.servings).toBe('1.00');
    expect(plain.nutrients.kcal).toBe('100.00');

    const oneAndAHalf = await planWith(cookie, '1.50');
    // 100.00 × 1.5 = 150.00, exactly.
    expect(oneAndAHalf.slots[0]?.nutrients.kcal).toBe('150.00');
    expect(oneAndAHalf.nutrients.kcal).toBe('150.00');
  });

  it("carries the trainer's own targets and nothing computed", async () => {
    const cookie = await growTrainer();
    const plan = await planWith(cookie);

    expect(plan.targets).toEqual({
      kcal: '2000.00',
      protein: '150.00',
      fat: '60.00',
      carbs: '210.00',
    });
  });

  it('refuse targets that cannot belong together, naming both numbers', async () => {
    const cookie = await growTrainer();
    const foodId = await createGlobalFood(harness);
    const meal = await addMeal(cookie, { name: 'Страва', items: [{ foodId, grams: '100.00' }] });

    const refused = await request(server())
      .post('/nutrition/plans')
      .set('Cookie', cookie)
      .send({
        name: 'Неможливі цілі',
        // 150 P + 60 F + 210 C is about 2 delta kcal, nowhere near 9000.
        targets: { kcal: '9000.00', protein: '150.00', fat: '60.00', carbs: '210.00' },
        slots: [{ slot: 'BREAKFAST', mealId: meal.id }],
      })
      .expect(400);

    const message = (refused.body as { message: string }).message;
    expect(message).toContain('9000.00');
    expect(message).toContain('1980');
  });

  it('accept a plan with no targets at all', async () => {
    const cookie = await growTrainer();
    const foodId = await createGlobalFood(harness);
    const meal = await addMeal(cookie, { name: 'Страва', items: [{ foodId, grams: '100.00' }] });

    const created = await request(server())
      .post('/nutrition/plans')
      .set('Cookie', cookie)
      .send({ name: 'Без цілей', slots: [{ slot: 'LUNCH', mealId: meal.id }] })
      .expect(201);

    expect((created.body as PublicMealPlan).targets).toEqual({
      kcal: null,
      protein: null,
      fat: null,
      carbs: null,
    });
  });

  it("refuse another trainer's meal in a slot", async () => {
    const first = await growTrainer();
    const second = await growTrainer(secondRegistration);
    const foodId = await createGlobalFood(harness);
    const theirMeal = await addMeal(second, {
      name: 'Їхня страва',
      items: [{ foodId, grams: '100.00' }],
    });

    // Meals have no global rows, so unlike a foodId this must be the caller's
    // OWN — 400, one body for foreign and nonexistent alike.
    await request(server())
      .post('/nutrition/plans')
      .set('Cookie', first)
      .send({ name: 'Чужа страва', slots: [{ slot: 'LUNCH', mealId: theirMeal.id }] })
      .expect(400);

    expect(await harness.prisma.mealPlan.count()).toBe(0);
  });

  it('answer 400, never 500, when a field is explicitly nulled', async () => {
    const cookie = await growTrainer();
    const foodId = await createGlobalFood(harness);
    const meal = await addMeal(cookie, { name: 'Страва', items: [{ foodId, grams: '100.00' }] });

    // `targets: null` is «clear all of them», which a screen may honestly
    // send — and which `@IsOptional` waved past every validator into code
    // expecting an object. The Step 29 lesson, one module later.
    const cleared = await request(server())
      .post('/nutrition/plans')
      .set('Cookie', cookie)
      .send({ name: 'Без цілей', targets: null, slots: [{ slot: 'LUNCH', mealId: meal.id }] })
      .expect(201);
    expect((cleared.body as PublicMealPlan).targets.kcal).toBeNull();

    // The rest must refuse rather than crash.
    for (const body of [
      { name: null, slots: [{ slot: 'LUNCH', mealId: meal.id }] },
      { name: 'X', slots: null },
      { name: 'X', slots: [{ slot: null, mealId: meal.id }] },
      { name: 'X', slots: [{ slot: 'LUNCH', mealId: null }] },
    ]) {
      const response = await request(server())
        .post('/nutrition/plans')
        .set('Cookie', cookie)
        .send(body);

      expect(response.status).toBe(400);
    }

    for (const body of [
      { name: null, items: [{ foodId, grams: '100.00' }] },
      { name: 'X', items: null },
      { name: 'X', items: [{ foodId: null, grams: '100.00' }] },
      { name: 'X', items: [{ foodId, grams: null }] },
    ]) {
      const response = await request(server())
        .post('/nutrition/meals')
        .set('Cookie', cookie)
        .send(body);

      expect(response.status).toBe(400);
    }
  });

  it("make another trainer's plan a byte-identical 404", async () => {
    const first = await growTrainer();
    const second = await growTrainer(secondRegistration);
    const plan = await planWith(first);

    const foreign = await request(server())
      .get(`/nutrition/plans/${plan.id}`)
      .set('Cookie', second);
    const missing = await request(server())
      .get('/nutrition/plans/clzzzzzzzzzzzzzzzzzzzzzz')
      .set('Cookie', second);

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });
});
