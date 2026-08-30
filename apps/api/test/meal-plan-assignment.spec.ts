import type {
  ClientNutrition,
  PublicMeal,
  PublicMealPlan,
  TrainerAssignedPlan,
} from '@gart/shared';
import request from 'supertest';

import {
  createAcceptedClient,
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

interface Ready {
  cookie: string;
  trainerId: string;
  clientId: string;
  clientCookie: string;
  foodId: string;
  meal: PublicMeal;
  plan: PublicMealPlan;
}

/** A trainer on GROW with a client, a meal and a plan — the common setup. */
async function ready(
  registration: typeof validRegistration = validRegistration,
  clientEmail = 'maria@example.com',
): Promise<Ready> {
  const cookie = await registerTrainer(harness, registration);
  const trainerId = await trainerIdFor(harness, registration.email);
  await subscribeToGrow(harness, trainerId);

  const { clientCookie, clientId } = await createAcceptedClient(harness, cookie, {
    email: clientEmail,
  });
  const foodId = await createGlobalFood(harness);

  const mealResponse = await request(server())
    .post('/nutrition/meals')
    .set('Cookie', cookie)
    .send({ name: 'Вівсянка', items: [{ foodId, grams: '100.00' }] })
    .expect(201);
  const meal = mealResponse.body as PublicMeal;

  const planResponse = await request(server())
    .post('/nutrition/plans')
    .set('Cookie', cookie)
    .send({
      name: 'День на дефіциті',
      targets: { kcal: '2000.00', protein: '150.00', fat: '60.00', carbs: '210.00' },
      slots: [{ slot: 'BREAKFAST', name: 'Ранок', mealId: meal.id, servings: '2.00' }],
    })
    .expect(201);

  return {
    cookie,
    trainerId,
    clientId,
    clientCookie,
    foodId,
    meal,
    plan: planResponse.body as PublicMealPlan,
  };
}

/** 'YYYY-MM-DD', `days` from today — relative, because the window is checked
 *  against the real clock and a fixed date would drift into the past or future. */
function day(offset: number): string {
  const date = new Date();

  date.setUTCDate(date.getUTCDate() + offset);

  return date.toISOString().slice(0, 10);
}

async function assign(
  setup: Ready,
  schedule: { startDate?: string; endDate?: string | null } = {},
): Promise<TrainerAssignedPlan> {
  const response = await request(server())
    .post('/nutrition/plans/assign')
    .set('Cookie', setup.cookie)
    .send({
      planId: setup.plan.id,
      clientId: setup.clientId,
      // Started a week ago by default, so the client's window filter sees it.
      startDate: schedule.startDate ?? day(-7),
      ...(schedule.endDate === undefined ? {} : { endDate: schedule.endDate }),
      daysOfWeek: [1, 3, 5],
    })
    .expect(201);

  return response.body as TrainerAssignedPlan;
}

describe('assigning a plan', () => {
  it('gives the client an independent copy, with the day computed', async () => {
    const setup = await ready();
    const assigned = await assign(setup);

    expect(assigned).toMatchObject({
      name: 'День на дефіциті',
      clientId: setup.clientId,
      sourcePlanId: setup.plan.id,
      startDate: day(-7),
      daysOfWeek: [1, 3, 5],
    });
    expect(assigned.targets.kcal).toBe('2000.00');
    // 100 g of a 100 kcal/100 g food, × 2 servings.
    expect(assigned.meals[0]).toMatchObject({ slot: 'BREAKFAST', name: 'Ранок', servings: '2.00' });
    expect(assigned.nutrients.kcal).toBe('200.00');
  });

  it('tells the client about it', async () => {
    const setup = await ready();
    await assign(setup);

    const notification = await harness.prisma.notification.findFirstOrThrow({
      where: { clientId: setup.clientId, audience: 'CLIENT' },
    });
    expect(notification.title).toBe('Новий план харчування');
  });

  it('refuses a date range that runs backwards', async () => {
    const setup = await ready();

    await request(server())
      .post('/nutrition/plans/assign')
      .set('Cookie', setup.cookie)
      .send({
        planId: setup.plan.id,
        clientId: setup.clientId,
        startDate: day(10),
        endDate: day(1),
        daysOfWeek: [1],
      })
      .expect(400);

    expect(await harness.prisma.mealPlanAssignment.count()).toBe(0);
  });

  it("refuses another trainer's plan and another trainer's client", async () => {
    const mine = await ready();
    const theirs = await ready(secondRegistration, 'other@example.com');

    await request(server())
      .post('/nutrition/plans/assign')
      .set('Cookie', mine.cookie)
      .send({
        planId: theirs.plan.id,
        clientId: mine.clientId,
        startDate: day(0),
        daysOfWeek: [1],
      })
      .expect(404);

    await request(server())
      .post('/nutrition/plans/assign')
      .set('Cookie', mine.cookie)
      .send({
        planId: mine.plan.id,
        clientId: theirs.clientId,
        startDate: day(0),
        daysOfWeek: [1],
      })
      .expect(404);

    expect(await harness.prisma.mealPlanAssignment.count()).toBe(0);
  });
});

describe('the snapshot invariant', () => {
  it('never changes when the plan or its meals are edited afterwards', async () => {
    const setup = await ready();
    const assigned = await assign(setup);
    const before = JSON.parse(JSON.stringify(assigned)) as TrainerAssignedPlan;

    // Rewrite the template as thoroughly as the API allows.
    const otherFood = await createGlobalFood(harness, {
      name: 'Інший продукт',
      kcal: '500.00',
      protein: '50.00',
      fat: '25.00',
      carbs: '25.00',
    });

    await request(server())
      .patch(`/nutrition/meals/${setup.meal.id}`)
      .set('Cookie', setup.cookie)
      .send({ name: 'Зовсім інша страва', items: [{ foodId: otherFood, grams: '300.00' }] })
      .expect(200);

    await request(server())
      .patch(`/nutrition/plans/${setup.plan.id}`)
      .set('Cookie', setup.cookie)
      .send({
        name: 'Перейменований план',
        targets: { kcal: '3000.00', protein: '200.00', fat: '90.00', carbs: '325.00' },
        slots: [{ slot: 'DINNER', mealId: setup.meal.id, servings: '5.00' }],
      })
      .expect(200);

    const reread = await request(server())
      .get(`/clients/${setup.clientId}/nutrition-plans`)
      .set('Cookie', setup.cookie)
      .expect(200);
    const now = (reread.body as TrainerAssignedPlan[])[0];

    // Field by field, because «looks the same» is not the assertion.
    expect(now?.name).toBe(before.name);
    expect(now?.targets).toEqual(before.targets);
    expect(now?.meals).toHaveLength(1);
    expect(now?.meals[0]?.slot).toBe('BREAKFAST');
    expect(now?.meals[0]?.name).toBe('Ранок');
    expect(now?.meals[0]?.servings).toBe('2.00');
    expect(now?.meals[0]?.items).toHaveLength(1);
    expect(now?.meals[0]?.items[0]?.foodId).toBe(setup.foodId);
    expect(now?.meals[0]?.items[0]?.grams).toBe('100.00');
    expect(now?.nutrients).toEqual(before.nutrients);
  });

  it('survives the template being deleted, keeping only provenance', async () => {
    const setup = await ready();
    await assign(setup);

    await request(server())
      .delete(`/nutrition/plans/${setup.plan.id}`)
      .set('Cookie', setup.cookie)
      .expect(204);

    const reread = await request(server())
      .get(`/clients/${setup.clientId}/nutrition-plans`)
      .set('Cookie', setup.cookie)
      .expect(200);

    const now = (reread.body as TrainerAssignedPlan[])[0];
    expect(now?.name).toBe('День на дефіциті');
    expect(now?.nutrients.kcal).toBe('200.00');
    // Provenance only, and it goes when the template does.
    expect(now?.sourcePlanId).toBeNull();
  });

  it('DOES follow a corrected food, because that is a fact being fixed', async () => {
    const setup = await ready();
    await assign(setup);

    // The other half of the invariant. An exercise's corrected video reaches an
    // assigned workout; a food's corrected energy reaches an assigned plan. What
    // must not travel is a REDESIGN of the template.
    await harness.prisma.food.update({
      where: { id: setup.foodId },
      data: { kcal: '150.00' },
    });

    const reread = await request(server())
      .get(`/clients/${setup.clientId}/nutrition-plans`)
      .set('Cookie', setup.cookie)
      .expect(200);

    // 150 kcal per 100 g × 100 g × 2 servings.
    expect((reread.body as TrainerAssignedPlan[])[0]?.nutrients.kcal).toBe('300.00');
  });

  it('leaves meals, plans and foods alone when it is deleted', async () => {
    const setup = await ready();
    const assigned = await assign(setup);

    await request(server())
      .delete(`/clients/${setup.clientId}/nutrition-plans/${assigned.id}`)
      .set('Cookie', setup.cookie)
      .expect(204);

    expect(await harness.prisma.mealPlanAssignment.count()).toBe(0);
    expect(await harness.prisma.assignedMeal.count()).toBe(0);
    expect(await harness.prisma.assignedMealItem.count()).toBe(0);
    expect(await harness.prisma.meal.count()).toBe(1);
    expect(await harness.prisma.mealPlan.count()).toBe(1);
    expect(await harness.prisma.food.count()).toBe(1);
  });
});

describe("a client's view", () => {
  it('shows their own plan, and nothing about the trainer', async () => {
    const setup = await ready();
    await assign(setup);

    const response = await request(server())
      .get('/me/nutrition')
      .set('Cookie', setup.clientCookie)
      .expect(200);

    const body = response.body as ClientNutrition;
    expect(body.available).toBe(true);
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0]).toMatchObject({ name: 'День на дефіциті' });
    expect(body.plans[0]?.nutrients.kcal).toBe('200.00');
    // The client's copy carries no trainer-side provenance at all.
    expect(Object.keys(body.plans[0] ?? {})).not.toContain('sourcePlanId');
    expect(Object.keys(body.plans[0] ?? {})).not.toContain('clientId');
  });

  it('shows only the plans that apply right now', async () => {
    const setup = await ready();

    // Running, finished, and not started yet.
    await assign(setup, { startDate: day(-7) });
    await assign(setup, { startDate: day(-30), endDate: day(-1) });
    await assign(setup, { startDate: day(7) });

    const response = await request(server())
      .get('/me/nutrition')
      .set('Cookie', setup.clientCookie)
      .expect(200);

    // Without the window a client accumulates every plan they were ever given,
    // with nothing on screen saying which one is current.
    const body = response.body as ClientNutrition;
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0]?.startDate).toBe(day(-7));

    // The other two are kept, not deleted — the trainer still sees all three.
    const trainerView = await request(server())
      .get(`/clients/${setup.clientId}/nutrition-plans`)
      .set('Cookie', setup.cookie)
      .expect(200);
    expect(trainerView.body as TrainerAssignedPlan[]).toHaveLength(3);
  });

  it('refuses to assign to an archived client', async () => {
    const setup = await ready();

    await request(server())
      .patch(`/clients/${setup.clientId}`)
      .set('Cookie', setup.cookie)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    // The screen filters archived clients out of its dropdown, but the
    // dropdown is not the gate — and an archived client cannot even sign in,
    // so the snapshot would be one nobody could ever read.
    const refused = await request(server())
      .post('/nutrition/plans/assign')
      .set('Cookie', setup.cookie)
      .send({
        planId: setup.plan.id,
        clientId: setup.clientId,
        startDate: day(0),
        daysOfWeek: [1],
      })
      .expect(400);

    expect((refused.body as { message: string }).message).toContain('архів');
    expect(await harness.prisma.mealPlanAssignment.count()).toBe(0);
  });

  it("never shows another client's plan", async () => {
    const setup = await ready();
    await assign(setup);

    const other = await createAcceptedClient(harness, setup.cookie, {
      fullName: 'Інший клієнт',
      email: 'other-client@example.com',
    });

    const response = await request(server())
      .get('/me/nutrition')
      .set('Cookie', other.clientCookie)
      .expect(200);

    const body = response.body as ClientNutrition;
    expect(body.available).toBe(true);
    expect(body.plans).toEqual([]);
  });

  it('says the section is closed — without an error and without blame', async () => {
    const setup = await ready();
    await assign(setup);

    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await harness.prisma.subscription.update({
      where: { trainerId: setup.trainerId },
      data: { status: 'ENDED', accessUntil: past, endedAt: past, nextChargeAt: null },
    });

    // 200 and not 402: a client is not the payer, and must never be handed an
    // error or anything about somebody else's billing.
    const response = await request(server())
      .get('/me/nutrition')
      .set('Cookie', setup.clientCookie)
      .expect(200);

    const body = response.body as ClientNutrition;
    expect(body.available).toBe(false);
    expect(body.plans).toEqual([]);

    // Closed, not destroyed.
    expect(await harness.prisma.mealPlanAssignment.count()).toBe(1);
    expect(await harness.prisma.assignedMealItem.count()).toBe(1);
  });

  it('returns everything the moment the trainer subscribes again', async () => {
    const setup = await ready();
    await assign(setup);

    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await harness.prisma.subscription.update({
      where: { trainerId: setup.trainerId },
      data: { status: 'ENDED', accessUntil: past, endedAt: past, nextChargeAt: null },
    });
    await subscribeToGrow(harness, setup.trainerId);

    const response = await request(server())
      .get('/me/nutrition')
      .set('Cookie', setup.clientCookie)
      .expect(200);

    const body = response.body as ClientNutrition;
    expect(body.available).toBe(true);
    expect(body.plans[0]?.nutrients.kcal).toBe('200.00');
  });

  it('is closed to a trainer session and to no session at all', async () => {
    const setup = await ready();

    await request(server()).get('/me/nutrition').set('Cookie', setup.cookie).expect(401);
    await request(server()).get('/me/nutrition').expect(401);
  });
});

describe('the GROW gate on every new route', () => {
  it('refuses a PRO trainer everywhere, including the client-facing read', async () => {
    const setup = await ready();
    const assigned = await assign(setup);

    await harness.prisma.subscription.update({
      where: { trainerId: setup.trainerId },
      data: { plan: 'PRO' },
    });

    const calls: (() => request.Test)[] = [
      () => request(server()).get('/nutrition/meals').set('Cookie', setup.cookie),
      () => request(server()).get(`/nutrition/meals/${setup.meal.id}`).set('Cookie', setup.cookie),
      () =>
        request(server())
          .post('/nutrition/meals')
          .set('Cookie', setup.cookie)
          .send({ name: 'X', items: [{ foodId: setup.foodId, grams: '1.00' }] }),
      () => request(server()).get('/nutrition/plans').set('Cookie', setup.cookie),
      () => request(server()).get(`/nutrition/plans/${setup.plan.id}`).set('Cookie', setup.cookie),
      () =>
        request(server())
          .post('/nutrition/plans/assign')
          .set('Cookie', setup.cookie)
          .send({
            planId: setup.plan.id,
            clientId: setup.clientId,
            startDate: day(0),
            daysOfWeek: [1],
          }),
      () =>
        request(server())
          .get(`/clients/${setup.clientId}/nutrition-plans`)
          .set('Cookie', setup.cookie),
      () =>
        request(server())
          .delete(`/clients/${setup.clientId}/nutrition-plans/${assigned.id}`)
          .set('Cookie', setup.cookie),
    ];

    for (const call of calls) {
      const response = await call();

      expect(response.status).toBe(402);
    }

    // And the client's read closes too, as data rather than a refusal.
    const client = await request(server())
      .get('/me/nutrition')
      .set('Cookie', setup.clientCookie)
      .expect(200);
    expect((client.body as ClientNutrition).available).toBe(false);
  });
});
