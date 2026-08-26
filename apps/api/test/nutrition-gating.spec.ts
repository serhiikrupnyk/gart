import { PLAN_CAPABILITIES, type NutritionStatus } from '@gart/shared';
import request from 'supertest';

import {
  createAcceptedClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  SAMPLE_NUTRIENTS,
  secondRegistration,
  subscribeToGrow,
  subscribeTrainer,
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

const NEW_FOOD = {
  name: 'Домашній сир',
  group: 'DAIRY' as const,
  nutrients: SAMPLE_NUTRIENTS,
};

/**
 * Every route the gate must hold on.
 *
 * Thunks and not built requests: each `request(app)` binds its own ephemeral
 * listener, so building five up front and awaiting them in turn talks to
 * servers that have already closed.
 */
function nutritionCalls(cookie: string, foodId = 'some-id'): (() => request.Test)[] {
  return [
    () => request(server()).get('/nutrition/foods').set('Cookie', cookie),
    () => request(server()).get(`/nutrition/foods/${foodId}`).set('Cookie', cookie),
    () => request(server()).post('/nutrition/foods').set('Cookie', cookie).send(NEW_FOOD),
    () =>
      request(server())
        .patch(`/nutrition/foods/${foodId}`)
        .set('Cookie', cookie)
        .send({ name: 'X' }),
    () => request(server()).delete(`/nutrition/foods/${foodId}`).set('Cookie', cookie),
  ];
}

describe('the GROW gate', () => {
  it('refuses a PRO trainer at the API, on every route', async () => {
    const cookie = await registerTrainer(harness);
    await subscribeTrainer(harness, await trainerIdFor(harness, validRegistration.email));

    for (const call of nutritionCalls(cookie)) {
      const response = await call();

      // 402 and not 403: this is «not on what you are paying for», which is a
      // distinction the trainer can act on. Refused at the API, not merely
      // hidden on a screen.
      expect(response.status).toBe(402);
      expect((response.body as { message: string }).message).toContain('GROW');
    }

    expect(await harness.prisma.food.count({ where: { trainerId: { not: null } } })).toBe(0);
  });

  it('refuses a trainer on the trial, which runs on PRO', async () => {
    // A trial exists to show what the plan somebody is most likely to buy
    // does. Quietly handing out a higher tier for fourteen days would make the
    // boundary meaningless at exactly the moment it is being learned.
    const cookie = await registerTrainer(harness);

    await request(server()).get('/nutrition/foods').set('Cookie', cookie).expect(402);
  });

  it('lets a GROW trainer through', async () => {
    const cookie = await registerTrainer(harness);
    await subscribeToGrow(harness, await trainerIdFor(harness, validRegistration.email));

    await request(server()).get('/nutrition/foods').set('Cookie', cookie).expect(200);
    await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send(NEW_FOOD)
      .expect(201);
  });

  it('is closed to a client session and to no session at all', async () => {
    const trainerCookie = await registerTrainer(harness);
    await subscribeToGrow(harness, await trainerIdFor(harness, validRegistration.email));
    const { clientCookie } = await createAcceptedClient(harness, trainerCookie);

    // A client never sees the food library: it is the trainer's working tool.
    await request(server()).get('/nutrition/foods').set('Cookie', clientCookie).expect(401);
    await request(server()).get('/nutrition/status').set('Cookie', clientCookie).expect(401);
    await request(server()).get('/nutrition/foods').expect(401);
  });

  it('keeps a lapsed GROW trainer reading but not writing', async () => {
    const cookie = await registerTrainer(harness);
    const trainerId = await trainerIdFor(harness, validRegistration.email);
    await subscribeToGrow(harness, trainerId);

    await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send(NEW_FOOD)
      .expect(201);

    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await harness.prisma.subscription.update({
      where: { trainerId },
      data: { status: 'ENDED', accessUntil: past, endedAt: past, nextChargeAt: null },
    });

    // The Step 27 discipline, unchanged: read-only, nothing destroyed.
    const list = await request(server()).get('/nutrition/foods').set('Cookie', cookie).expect(200);
    expect((list.body as { total: number }).total).toBeGreaterThan(0);

    await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send({ ...NEW_FOOD, name: 'Ще один' })
      .expect(402);
  });
});

describe('the nutrition status', () => {
  it('answers on every plan, so a downgrade can be verified rather than believed', async () => {
    const cookie = await registerTrainer(harness);
    const trainerId = await trainerIdFor(harness, validRegistration.email);
    await subscribeToGrow(harness, trainerId);

    for (const name of ['Домашній сир', 'Смузі']) {
      await request(server())
        .post('/nutrition/foods')
        .set('Cookie', cookie)
        .send({ ...NEW_FOOD, name })
        .expect(201);
    }

    const onGrow = await request(server())
      .get('/nutrition/status')
      .set('Cookie', cookie)
      .expect(200);
    expect(onGrow.body).toEqual({ available: true, customFoodCount: 2, requiredPlan: 'GROW' });

    // Downgrade. The gate closes and the count keeps answering.
    await harness.prisma.subscription.update({ where: { trainerId }, data: { plan: 'PRO' } });

    const onPro = await request(server())
      .get('/nutrition/status')
      .set('Cookie', cookie)
      .expect(200);
    expect(onPro.body).toEqual({ available: false, customFoodCount: 2, requiredPlan: 'GROW' });
  });

  it('survives a downgrade intact, and returns on re-upgrade', async () => {
    const cookie = await registerTrainer(harness);
    const trainerId = await trainerIdFor(harness, validRegistration.email);
    await subscribeToGrow(harness, trainerId);

    const created = await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send({
        ...NEW_FOOD,
        name: 'Бабусин сир',
        portions: [{ label: 'порція', grams: '200.00' }],
      })
      .expect(201);
    const foodId = (created.body as { id: string }).id;

    await harness.prisma.subscription.update({ where: { trainerId }, data: { plan: 'PRO' } });
    await request(server()).get(`/nutrition/foods/${foodId}`).set('Cookie', cookie).expect(402);

    // Nothing was destroyed by the downgrade — the row and its portions are
    // exactly where they were.
    expect(await harness.prisma.food.count({ where: { trainerId } })).toBe(1);
    expect(await harness.prisma.foodPortion.count({ where: { foodId } })).toBe(1);

    await harness.prisma.subscription.update({ where: { trainerId }, data: { plan: 'GROW' } });

    const back = await request(server())
      .get(`/nutrition/foods/${foodId}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(back.body).toMatchObject({
      name: 'Бабусин сир',
      portions: [{ label: 'порція', grams: '200.00' }],
    });
  });
});

describe('the plan registry', () => {
  it('sells GROW and still refuses SCALE', async () => {
    const cookie = await registerTrainer(harness);

    // Step 27 refused GROW because nothing stood behind it. Nutrition does now.
    await request(server())
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'GROW', period: 'MONTHLY' })
      .expect(201);

    const second = await registerTrainer(harness, secondRegistration);
    const refused = await request(server())
      .post('/billing/subscription/checkout')
      .set('Cookie', second)
      .send({ plan: 'SCALE', period: 'MONTHLY' })
      .expect(400);

    // SCALE is defined by a bigger team and an extended agenda, neither built.
    expect((refused.body as { message: string }).message).toContain('недоступний');
    expect(PLAN_CAPABILITIES.SCALE.sellable).toBe(false);
  });

  it('opens nutrition the moment a GROW checkout settles', async () => {
    const cookie = await registerTrainer(harness);

    await request(server()).get('/nutrition/foods').set('Cookie', cookie).expect(402);

    await request(server())
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'GROW', period: 'MONTHLY' })
      .expect(201);

    // The fake acquirer settles inline, so the subscription is live here.
    const status = await request(server())
      .get('/nutrition/status')
      .set('Cookie', cookie)
      .expect(200);
    expect((status.body as NutritionStatus).available).toBe(true);

    await request(server()).get('/nutrition/foods').set('Cookie', cookie).expect(200);
  });
});
