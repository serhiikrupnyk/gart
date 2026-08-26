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

  it('keeps nutrition open for a PAST_DUE GROW trainer inside their grace', async () => {
    const cookie = await registerTrainer(harness);
    const trainerId = await trainerIdFor(harness, validRegistration.email);
    await subscribeToGrow(harness, trainerId);

    await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send(NEW_FOOD)
      .expect(201);

    // A card that failed, inside the dunning grace: still LIVE, and the trainer
    // means to come back. Taking their work out of sight while they fix it
    // would punish the wrong thing.
    const graceEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await harness.prisma.subscription.update({
      where: { trainerId },
      data: { status: 'PAST_DUE', failedAttempts: 1, accessUntil: graceEnd },
    });

    const list = await request(server()).get('/nutrition/foods').set('Cookie', cookie).expect(200);
    expect((list.body as { total: number }).total).toBeGreaterThan(0);

    // Writes too. Grace is not a degraded state — access is LIVE throughout it,
    // which is the whole point of granting it: a trainer chasing their bank
    // keeps working normally. Read-only begins when access actually lapses.
    await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send({ ...NEW_FOOD, name: 'Ще один' })
      .expect(201);
  });

  it("closes nutrition once a PAST_DUE trainer's grace has run out", async () => {
    const cookie = await registerTrainer(harness);
    const trainerId = await trainerIdFor(harness, validRegistration.email);
    await subscribeToGrow(harness, trainerId);

    // Same status word, opposite answer — because the distinction that matters
    // is whether access is live, not what the state machine last wrote down.
    const past = new Date(Date.now() - 1000);
    await harness.prisma.subscription.update({
      where: { trainerId },
      data: { status: 'PAST_DUE', failedAttempts: 4, accessUntil: past, nextChargeAt: null },
    });

    await request(server()).get('/nutrition/foods').set('Cookie', cookie).expect(402);
  });

  it('closes nutrition once a GROW subscription has ENDED', async () => {
    const cookie = await registerTrainer(harness);
    const trainerId = await trainerIdFor(harness, validRegistration.email);
    await subscribeToGrow(harness, trainerId);

    const created = await request(server())
      .post('/nutrition/foods')
      .set('Cookie', cookie)
      .send({ ...NEW_FOOD, portions: [{ label: 'порція', grams: '200.00' }] })
      .expect(201);
    const foodId = (created.body as { id: string }).id;

    // ENDED is settled: nobody is paying and nobody intends to. Leaving a
    // higher tier open here would let GROW be bought once and kept for ever by
    // simply letting it lapse.
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await harness.prisma.subscription.update({
      where: { trainerId },
      data: { status: 'ENDED', accessUntil: past, endedAt: past, nextChargeAt: null },
    });

    await request(server()).get('/nutrition/foods').set('Cookie', cookie).expect(402);
    await request(server()).get(`/nutrition/foods/${foodId}`).set('Cookie', cookie).expect(402);

    // Closed, not deleted. The row and its portions are exactly where they were.
    expect(await harness.prisma.food.count({ where: { trainerId } })).toBe(1);
    expect(await harness.prisma.foodPortion.count({ where: { foodId } })).toBe(1);

    // And the count still answers, with the way back.
    const status = await request(server())
      .get('/nutrition/status')
      .set('Cookie', cookie)
      .expect(200);
    expect(status.body).toEqual({ available: false, customFoodCount: 1, requiredPlan: 'GROW' });

    // Re-upgrading brings it all back, through the API and not just the table.
    await subscribeToGrow(harness, trainerId);

    const back = await request(server())
      .get(`/nutrition/foods/${foodId}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(back.body).toMatchObject({
      name: 'Домашній сир',
      portions: [{ label: 'порція', grams: '200.00' }],
    });
  });

  it('closes nutrition once a CANCELLED subscription has run out', async () => {
    const cookie = await registerTrainer(harness);
    const trainerId = await trainerIdFor(harness, validRegistration.email);
    await subscribeToGrow(harness, trainerId);

    // Cancelled but still inside the period already paid for: they paid, so
    // they keep it.
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await harness.prisma.subscription.update({
      where: { trainerId },
      data: { status: 'CANCELLED', accessUntil: future, nextChargeAt: null },
    });
    await request(server()).get('/nutrition/foods').set('Cookie', cookie).expect(200);

    // Once it runs out, it is over. `endLapsed` only ever moves PAST_DUE rows
    // to ENDED, so this row stays CANCELLED for ever — gating on the status
    // word would have left cancelling open as a way to buy GROW once and keep
    // it. Liveness is what actually closes it.
    const past = new Date(Date.now() - 1000);
    await harness.prisma.subscription.update({
      where: { trainerId },
      data: { accessUntil: past },
    });

    const row = await harness.prisma.subscription.findUniqueOrThrow({ where: { trainerId } });
    expect(row.status).toBe('CANCELLED');

    await request(server()).get('/nutrition/foods').set('Cookie', cookie).expect(402);
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
