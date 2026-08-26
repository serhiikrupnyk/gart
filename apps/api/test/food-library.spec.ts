import { scaleNutrients, sumNutrients, type FoodPage, type PublicFood } from '@gart/shared';
import request from 'supertest';

import {
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  SAMPLE_NUTRIENTS,
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

/** A trainer with nutrition, ready to use it. */
async function growTrainer(
  registration: typeof validRegistration = validRegistration,
): Promise<string> {
  const cookie = await registerTrainer(harness, registration);
  await subscribeToGrow(harness, await trainerIdFor(harness, registration.email));

  return cookie;
}

async function addFood(
  cookie: string,
  overrides: Record<string, unknown> = {},
): Promise<PublicFood> {
  const response = await request(server())
    .post('/nutrition/foods')
    .set('Cookie', cookie)
    .send({
      name: 'Домашній сир',
      group: 'DAIRY',
      nutrients: SAMPLE_NUTRIENTS,
      ...overrides,
    })
    .expect(201);

  return response.body as PublicFood;
}

/** A global row, as the seed produces. */
async function addGlobalFood(name: string, group = 'GRAINS'): Promise<string> {
  const food = await harness.prisma.food.create({
    data: {
      name,
      group: group as 'GRAINS',
      kcal: '343.00',
      protein: '13.25',
      fat: '3.40',
      carbs: '71.50',
      fibre: '10.00',
      source: 'USDA FoodData Central (CC0)',
      portions: { create: [{ label: 'склянка', grams: '200.00' }] },
    },
  });

  return food.id;
}

describe('ownership', () => {
  it('shows the shared library to every trainer, marked as not theirs', async () => {
    await addGlobalFood('Гречка, крупа суха');
    const cookie = await growTrainer();

    const list = await request(server()).get('/nutrition/foods').set('Cookie', cookie).expect(200);

    const page = list.body as FoodPage;
    expect(page.items).toHaveLength(1);
    // Derived from ownership rather than stored: a global row belongs to
    // nobody, so nobody may edit it.
    expect(page.items[0]).toMatchObject({ name: 'Гречка, крупа суха', editable: false });
  });

  it('refuses to let a trainer edit or delete a global food — 404, not 403', async () => {
    const globalId = await addGlobalFood('Гречка, крупа суха');
    const cookie = await growTrainer();

    // Readable...
    await request(server()).get(`/nutrition/foods/${globalId}`).set('Cookie', cookie).expect(200);

    // ...and unwritable, by construction: `{ id, trainerId }` cannot match a
    // NULL trainerId, so there is no "if global" branch to forget.
    await request(server())
      .patch(`/nutrition/foods/${globalId}`)
      .set('Cookie', cookie)
      .send({ name: 'Моя гречка' })
      .expect(404);
    await request(server())
      .delete(`/nutrition/foods/${globalId}`)
      .set('Cookie', cookie)
      .expect(404);

    const untouched = await harness.prisma.food.findFirstOrThrow({ where: { id: globalId } });
    expect(untouched.name).toBe('Гречка, крупа суха');
  });

  it("makes another trainer's food a byte-identical 404", async () => {
    const first = await growTrainer();
    const second = await growTrainer(secondRegistration);
    const mine = await addFood(first, { name: 'Мій сир' });

    const server_ = server();
    const foreign = await request(server_).get(`/nutrition/foods/${mine.id}`).set('Cookie', second);
    const missing = await request(server_)
      .get('/nutrition/foods/clzzzzzzzzzzzzzzzzzzzzzz')
      .set('Cookie', second);

    // Identical in body, not just in status: a differing shape would confirm
    // the id exists somewhere.
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);

    await request(server_)
      .patch(`/nutrition/foods/${mine.id}`)
      .set('Cookie', second)
      .send({ name: 'Викрадено' })
      .expect(404);
    await request(server_).delete(`/nutrition/foods/${mine.id}`).set('Cookie', second).expect(404);

    const untouched = await harness.prisma.food.findFirstOrThrow({ where: { id: mine.id } });
    expect(untouched.name).toBe('Мій сир');
  });

  it("never lists another trainer's food", async () => {
    const first = await growTrainer();
    const second = await growTrainer(secondRegistration);
    await addFood(first, { name: 'Мій унікальний сир' });
    await addGlobalFood('Гречка, крупа суха');

    const list = await request(server()).get('/nutrition/foods').set('Cookie', second).expect(200);

    const names = (list.body as FoodPage).items.map((food) => food.name);
    expect(names).toEqual(['Гречка, крупа суха']);
  });

  it("filters to a trainer's own on request", async () => {
    const cookie = await growTrainer();
    await addGlobalFood('Гречка, крупа суха');
    await addFood(cookie, { name: 'Мій сир' });

    const mine = await request(server())
      .get('/nutrition/foods?mineOnly=true')
      .set('Cookie', cookie)
      .expect(200);

    const items = (mine.body as FoodPage).items;
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('Мій сир');
  });
});

describe('search', () => {
  it('finds Ukrainian names case-insensitively, in both directions', async () => {
    await addGlobalFood('Гречка, крупа суха');
    const cookie = await growTrainer();

    for (const term of ['греч', 'ГРЕЧ', 'Гречка', 'крупа']) {
      const found = await request(server())
        .get(`/nutrition/foods?search=${encodeURIComponent(term)}`)
        .set('Cookie', cookie)
        .expect(200);

      expect((found.body as FoodPage).total).toBe(1);
    }
  });

  it('searches the brand as well as the name', async () => {
    const cookie = await growTrainer();
    await addFood(cookie, { name: 'Йогурт', brand: 'Галичина' });

    const found = await request(server())
      .get(`/nutrition/foods?search=${encodeURIComponent('галичина')}`)
      .set('Cookie', cookie)
      .expect(200);

    expect((found.body as FoodPage).total).toBe(1);
  });

  it('filters by group', async () => {
    const cookie = await growTrainer();
    await addGlobalFood('Гречка, крупа суха', 'GRAINS');
    await addFood(cookie, { name: 'Сир', group: 'DAIRY' });

    const dairy = await request(server())
      .get('/nutrition/foods?group=DAIRY')
      .set('Cookie', cookie)
      .expect(200);

    expect((dairy.body as FoodPage).items.map((food) => food.name)).toEqual(['Сир']);
  });
});

describe('nutrient validation', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    [
      'macros over 100 g per 100 g',
      { protein: '50.00', fat: '40.00', carbs: '30.00', kcal: '680.00' },
      '100',
    ],
    ['fibre over carbs', { fibre: '80.00' }, 'Клітковина'],
    ['sugars over carbs', { sugars: '80.00' }, 'Цукри'],
    ['saturates over fat', { saturatedFat: '80.00' }, 'Насичені'],
    ['a negative amount', { protein: '-1.00' }, 'Білки'],
    ['more than two decimals', { protein: '1.005' }, 'Білки'],
    ['something that is not a number', { protein: 'багато' }, 'Білки'],
  ];

  for (const [label, patch, expected] of cases) {
    it(`refuses ${label}`, async () => {
      const cookie = await growTrainer();

      const response = await request(server())
        .post('/nutrition/foods')
        .set('Cookie', cookie)
        .send({
          name: 'Неможливий продукт',
          group: 'OTHER',
          nutrients: { ...SAMPLE_NUTRIENTS, ...patch },
        })
        .expect(400);

      expect(JSON.stringify(response.body)).toContain(expected);
      expect(await harness.prisma.food.count()).toBe(0);
    });
  }

  it('refuses fibre and sugars that together exceed the carbohydrate', async () => {
    const cookie = await growTrainer();

    // Both are subsets of total carbohydrate and are disjoint — starch is what
    // remains — so bounding each against carbs separately let this through.
    const refused = await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send({
        name: 'Неможливі вуглеводи',
        group: 'OTHER',
        nutrients: { ...SAMPLE_NUTRIENTS, carbs: '50.00', fibre: '50.00', sugars: '50.00' },
      })
      .expect(400);

    expect((refused.body as { message: string }).message).toContain('разом');
  });

  it('answers 400, never 500, when a non-nullable field is explicitly nulled', async () => {
    const cookie = await growTrainer();
    const created = await addFood(cookie);

    // `@IsOptional` skips every sibling validator on null as well as undefined,
    // which waved these through to code expecting an object — turning «clear
    // this» into a stack trace. The exercise library learned this already.
    for (const body of [{ nutrients: null }, { portions: null }, { name: null }, { group: null }]) {
      const response = await request(server())
        .patch(`/nutrition/foods/${created.id}`)
        .set('Cookie', cookie)
        .send(body);

      expect(response.status).toBe(400);
    }

    // And the food is exactly as it was.
    const unchanged = await request(server())
      .get(`/nutrition/foods/${created.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect((unchanged.body as PublicFood).name).toBe('Домашній сир');
  });

  it('names BOTH numbers when the energy does not match the macros', async () => {
    const cookie = await growTrainer();

    const response = await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send({
        name: 'Помилка введення',
        group: 'OTHER',
        // 13 g protein, 11 g fat, 1.1 g carbs is about 156 kcal, not 900.
        nutrients: { ...SAMPLE_NUTRIENTS, kcal: '900.00' },
      })
      .expect(400);

    const message = (response.body as { message: string }).message;
    // «Калорійність не сходиться» alone tells a trainer nothing about which of
    // four fields they mistyped.
    expect(message).toContain('900.00');
    expect(message).toContain('155');
  });

  it('accepts energy that legitimately departs from Atwater', async () => {
    const cookie = await growTrainer();

    // Fibre-rich foods measure BELOW the Atwater estimate, because fibre is
    // counted as carbohydrate at 4 kcal/g but yields about 2. The band must not
    // refuse real food.
    await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send({
        name: 'Висівки',
        group: 'GRAINS',
        nutrients: {
          kcal: '216.00',
          protein: '15.55',
          fat: '4.25',
          carbs: '64.51',
          fibre: '42.80',
          sugars: '0.41',
          saturatedFat: '0.63',
          salt: '0.00',
        },
      })
      .expect(201);
  });
});

describe('decimal precision', () => {
  it('round-trips exactly, never through a float', async () => {
    const cookie = await growTrainer();

    const exact = {
      kcal: '155.55',
      protein: '12.35',
      fat: '11.05',
      carbs: '1.15',
      fibre: '0.05',
      sugars: '1.10',
      saturatedFat: '3.35',
      salt: '0.15',
    };

    const created = await addFood(cookie, { name: 'Точні значення', nutrients: exact });

    // The values a float would have mangled: 12.35 must not come back as
    // 12.350000000000001, and 0.05 must not become 0.05000000000000000277.
    expect(created.nutrients).toEqual(exact);

    const reread = await request(server())
      .get(`/nutrition/foods/${created.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect((reread.body as PublicFood).nutrients).toEqual(exact);
  });

  it('refuses a third decimal place — one scale for every nutrient', async () => {
    const cookie = await growTrainer();

    await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send({
        name: 'Забагато знаків',
        group: 'OTHER',
        nutrients: { ...SAMPLE_NUTRIENTS, salt: '0.125' },
      })
      .expect(400);
  });

  it('keeps an unmeasured nutrient null, which is not zero', async () => {
    const cookie = await growTrainer();

    const created = await addFood(cookie, {
      name: 'Без клітковини у даних',
      nutrients: { ...SAMPLE_NUTRIENTS, fibre: null, sugars: null },
    });

    expect(created.nutrients.fibre).toBeNull();
    expect(created.nutrients.sugars).toBeNull();
  });
});

describe('portions', () => {
  it('stores them and scales the profile exactly', async () => {
    const cookie = await growTrainer();

    const created = await addFood(cookie, {
      name: 'Яйце куряче',
      group: 'EGGS',
      nutrients: { ...SAMPLE_NUTRIENTS, kcal: '155.00' },
      portions: [
        { label: 'яйце середнє', grams: '55.00' },
        { label: 'яйце велике', grams: '63.00' },
      ],
    });

    expect(created.portions.map((portion) => portion.label)).toEqual([
      'яйце велике',
      'яйце середнє',
    ]);

    const medium = created.portions.find((portion) => portion.label === 'яйце середнє');
    const scaled = scaleNutrients(created.nutrients, medium?.grams ?? '0');

    // 155.00 × 55 ÷ 100 = 85.25, exactly, as a string.
    expect(scaled?.kcal).toBe('85.25');
  });

  it('refuses two portions with the same name, however they are cased', async () => {
    const cookie = await growTrainer();

    await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send({
        name: 'Молоко',
        group: 'DAIRY',
        nutrients: SAMPLE_NUTRIENTS,
        portions: [
          { label: 'склянка', grams: '250.00' },
          { label: 'Склянка', grams: '200.00' },
        ],
      })
      .expect(400);
  });

  it('refuses a weight outside the bounds', async () => {
    const cookie = await growTrainer();

    for (const grams of ['0.00', '99999.00']) {
      await request(server())
        .post('/nutrition/foods')
        .set('Cookie', cookie)
        .send({
          name: 'Дивна порція',
          group: 'OTHER',
          nutrients: SAMPLE_NUTRIENTS,
          portions: [{ label: 'порція', grams }],
        })
        .expect(400);
    }
  });

  it('replaces the whole set on update rather than merging', async () => {
    const cookie = await growTrainer();
    const created = await addFood(cookie, {
      portions: [
        { label: 'склянка', grams: '250.00' },
        { label: 'ложка', grams: '25.00' },
      ],
    });

    const updated = await request(server())
      .patch(`/nutrition/foods/${created.id}`)
      .set('Cookie', cookie)
      .send({ portions: [{ label: 'порція', grams: '200.00' }] })
      .expect(200);

    expect((updated.body as PublicFood).portions.map((portion) => portion.label)).toEqual([
      'порція',
    ]);
    expect(await harness.prisma.foodPortion.count({ where: { foodId: created.id } })).toBe(1);
  });

  it('dies with its food', async () => {
    const cookie = await growTrainer();
    const created = await addFood(cookie, {
      portions: [{ label: 'склянка', grams: '250.00' }],
    });

    await request(server())
      .delete(`/nutrition/foods/${created.id}`)
      .set('Cookie', cookie)
      .expect(204);

    expect(await harness.prisma.foodPortion.count({ where: { foodId: created.id } })).toBe(0);
  });

  it('sums a plate exactly, and reports an unknown as unknown', async () => {
    const known = { ...SAMPLE_NUTRIENTS, kcal: '100.00', protein: '10.00' };
    const unmeasured = { ...SAMPLE_NUTRIENTS, kcal: '50.00', protein: '5.00', fibre: null };

    const total = sumNutrients([known, known, unmeasured]);

    expect(total?.kcal).toBe('250.00');
    expect(total?.protein).toBe('25.00');
    // «unknown + 5» is unknown. Reporting 0 would silently omit whatever
    // nobody measured from a day's total.
    expect(total?.fibre).toBeNull();
  });
});

describe("a trainer's own entry", () => {
  it('says so in its source rather than borrowing an authority', async () => {
    const cookie = await growTrainer();
    const created = await addFood(cookie);

    expect(created.source).toBe('Власний запис тренера');
    expect(created.editable).toBe(true);
  });
});
