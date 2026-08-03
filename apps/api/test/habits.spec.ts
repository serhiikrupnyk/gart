import request from 'supertest';

import type { HabitDay, HabitsView, HabitStatus, PublicHabit } from '@gart/shared';

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

function isoDate(offsetDays: number): string {
  const now = new Date();
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return new Date(utcToday + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const WATER = { name: 'Вода', kind: 'AMOUNT', targetValue: 8, unit: 'склянок' };
const WALK = { name: 'Прогулянка', kind: 'CHECK' };

describe('habits', () => {
  let harness: Harness;
  let cookieA: string;
  let cookieB: string;
  let clientCookie: string;
  let clientId: string;

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

    const accepted = await createAcceptedClient(harness, cookieA);
    clientCookie = accepted.clientCookie;
    clientId = accepted.clientId;
  });

  const server = () => harness.app.getHttpServer();

  async function createHabit(
    body: Record<string, unknown> = WATER,
    cookie = cookieA,
    target = clientId,
  ): Promise<PublicHabit> {
    return (
      await request(server())
        .post(`/clients/${target}/habits`)
        .set('Cookie', cookie)
        .send(body)
        .expect(201)
    ).body as PublicHabit;
  }

  function log(habitId: string, date: string, value: number, cookie = clientCookie) {
    return request(server())
      .put(`/me/habits/${habitId}/logs/${date}`)
      .set('Cookie', cookie)
      .send({ value });
  }

  async function mine(date = isoDate(0), cookie = clientCookie): Promise<HabitsView> {
    return (
      await request(server()).get(`/me/habits?date=${date}`).set('Cookie', cookie).expect(200)
    ).body as HabitsView;
  }

  function statusOf(view: HabitsView, name: string): HabitStatus {
    const found = view.habits.find((habit) => habit.name === name);

    if (found === undefined) {
      throw new Error(`No habit named ${name}`);
    }

    return found;
  }

  describe('definitions', () => {
    it('stores a measured habit and a checkbox habit in the same shape', async () => {
      const water = await createHabit(WATER);
      const walk = await createHabit(WALK);

      expect(water).toMatchObject({
        name: 'Вода',
        kind: 'AMOUNT',
        targetValue: 8,
        unit: 'склянок',
      });
      // A checkbox habit is simply a target of 1 — no nullable target anywhere.
      expect(walk).toMatchObject({
        name: 'Прогулянка',
        kind: 'CHECK',
        targetValue: 1,
        unit: null,
      });
    });

    it('refuses combinations that would make a habit incoherent', async () => {
      for (const body of [
        { name: 'Крок', kind: 'CHECK', targetValue: 8 },
        { name: 'Крок', kind: 'CHECK', unit: 'разів' },
        { name: 'Крок', kind: 'AMOUNT', targetValue: 10 },
        { name: 'Крок', kind: 'AMOUNT', unit: 'кроків' },
        { name: 'Крок', kind: 'AMOUNT', targetValue: 0, unit: 'кроків' },
        { name: '', kind: 'CHECK' },
        { name: 'Крок', kind: 'СХОДИ' },
      ]) {
        await request(server())
          .post(`/clients/${clientId}/habits`)
          .set('Cookie', cookieA)
          .send(body)
          .expect(400);
      }

      expect(await harness.prisma.habit.count()).toBe(0);
    });

    it('updates, validating the habit it will become', async () => {
      const habit = await createHabit(WATER);

      const renamed = (
        await request(server())
          .patch(`/habits/${habit.id}`)
          .set('Cookie', cookieA)
          .send({ name: 'Вода зранку', targetValue: 10 })
          .expect(200)
      ).body as PublicHabit;
      expect(renamed).toMatchObject({ name: 'Вода зранку', targetValue: 10, unit: 'склянок' });

      // Becoming a checkbox habit must leave a coherent row, so the unit has
      // to go with it.
      await request(server())
        .patch(`/habits/${habit.id}`)
        .set('Cookie', cookieA)
        .send({ kind: 'CHECK' })
        .expect(400);

      const toCheck = (
        await request(server())
          .patch(`/habits/${habit.id}`)
          .set('Cookie', cookieA)
          .send({ kind: 'CHECK', unit: null })
          .expect(200)
      ).body as PublicHabit;
      expect(toCheck).toMatchObject({ kind: 'CHECK', targetValue: 1, unit: null });
    });

    it('refuses a duplicate name per client, allows it across clients', async () => {
      await createHabit(WATER);

      await request(server())
        .post(`/clients/${clientId}/habits`)
        .set('Cookie', cookieA)
        .send(WATER)
        .expect(409);

      const sibling = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });
      await createHabit(WATER, cookieA, sibling.clientId);

      expect(await harness.prisma.habit.count()).toBe(2);
    });

    it('takes the days with the habit', async () => {
      const habit = await createHabit(WALK);
      await log(habit.id, isoDate(0), 1).expect(200);

      await request(server()).delete(`/habits/${habit.id}`).set('Cookie', cookieA).expect(204);

      expect(await harness.prisma.habitLog.count()).toBe(0);
    });
  });

  describe('daily records', () => {
    it('upserts one record per habit per day', async () => {
      const habit = await createHabit(WATER);

      const first = await log(habit.id, isoDate(0), 5).expect(200);
      expect(first.body).toMatchObject({ date: isoDate(0), value: 5, met: false });

      const corrected = await log(habit.id, isoDate(0), 8).expect(200);
      expect(corrected.body).toMatchObject({ value: 8, met: true });

      expect(await harness.prisma.habitLog.count()).toBe(1);
    });

    it('untapping removes the day rather than recording a zero', async () => {
      const habit = await createHabit(WALK);
      await log(habit.id, isoDate(0), 1).expect(200);

      await request(server())
        .delete(`/me/habits/${habit.id}/logs/${isoDate(0)}`)
        .set('Cookie', clientCookie)
        .expect(204);
      await request(server())
        .delete(`/me/habits/${habit.id}/logs/${isoDate(0)}`)
        .set('Cookie', clientCookie)
        .expect(404);

      expect(statusOf(await mine(), 'Прогулянка').today).toBeNull();
    });

    it('keeps a partial amount as data, without counting it', async () => {
      const habit = await createHabit(WATER);
      await log(habit.id, isoDate(0), 5).expect(200);

      const status = statusOf(await mine(), 'Вода');

      expect(status.today).toMatchObject({ value: 5, met: false });
      expect(status.currentStreak).toBe(0);
    });

    it('preserves a decimal value', async () => {
      const habit = await createHabit({ name: 'Сон', kind: 'AMOUNT', targetValue: 8, unit: 'год' });
      await log(habit.id, isoDate(0), 7.5).expect(200);

      expect(statusOf(await mine(), 'Сон').today?.value).toBe(7.5);
      expect((await harness.prisma.habitLog.findFirstOrThrow()).value.toString()).toBe('7.5');
    });

    it('validates the value and the date', async () => {
      const habit = await createHabit(WATER);

      await log(habit.id, isoDate(0), -1).expect(400);
      await request(server())
        .put(`/me/habits/${habit.id}/logs/${isoDate(0)}`)
        .set('Cookie', clientCookie)
        .send({ value: 'багато' })
        .expect(400);
      await log(habit.id, '2026-02-31', 8).expect(400);
      await log(habit.id, '01.08.2026', 8).expect(400);
    });
  });

  describe('streaks', () => {
    it('counts consecutive met days ending today', async () => {
      const habit = await createHabit(WALK);

      for (const offset of [-2, -1, 0]) {
        await log(habit.id, isoDate(offset), 1).expect(200);
      }

      const status = statusOf(await mine(), 'Прогулянка');
      expect(status.currentStreak).toBe(3);
      expect(status.longestStreak).toBe(3);
    });

    it('keeps the streak alive through an unticked today', async () => {
      const habit = await createHabit(WALK);

      for (const offset of [-3, -2, -1]) {
        await log(habit.id, isoDate(offset), 1).expect(200);
      }

      // Today is untouched, and the streak still reads three — the day is not
      // over yet.
      const status = statusOf(await mine(), 'Прогулянка');
      expect(status.today).toBeNull();
      expect(status.currentStreak).toBe(3);
    });

    it('breaks on a gap and on a day below target, keeping the record', async () => {
      const habit = await createHabit(WATER);

      // Four met days, a gap, then two more.
      for (const offset of [-7, -6, -5, -4]) {
        await log(habit.id, isoDate(offset), 8).expect(200);
      }
      await log(habit.id, isoDate(-3), 3).expect(200);
      for (const offset of [-1, 0]) {
        await log(habit.id, isoDate(offset), 8).expect(200);
      }

      const status = statusOf(await mine(), 'Вода');
      expect(status.currentStreak).toBe(2);
      expect(status.longestStreak).toBe(4);
    });

    it('is zero when nothing has been recorded, and after a missed yesterday', async () => {
      const habit = await createHabit(WALK);

      expect(statusOf(await mine(), 'Прогулянка').currentStreak).toBe(0);

      await log(habit.id, isoDate(-2), 1).expect(200);
      // Yesterday was missed, so today's grace has nothing to stand on.
      expect(statusOf(await mine(), 'Прогулянка').currentStreak).toBe(0);
      expect(statusOf(await mine(), 'Прогулянка').longestStreak).toBe(1);
    });

    it("answers for the DEVICE's day, not the server's", async () => {
      const habit = await createHabit(WALK);

      for (const offset of [-2, -1]) {
        await log(habit.id, isoDate(offset), 1).expect(200);
      }

      // A device already on tomorrow sees yesterday as the day before last, so
      // its streak has already lapsed — the answer follows the date asked for.
      expect(statusOf(await mine(isoDate(0)), 'Прогулянка').currentStreak).toBe(2);
      expect(statusOf(await mine(isoDate(1)), 'Прогулянка').currentStreak).toBe(0);
    });

    it('reports the last seven days for the strip', async () => {
      const habit = await createHabit(WATER);
      await log(habit.id, isoDate(-1), 8).expect(200);
      await log(habit.id, isoDate(0), 4).expect(200);

      const { recentDays } = statusOf(await mine(), 'Вода');

      expect(recentDays).toHaveLength(7);
      expect(recentDays[0]?.date).toBe(isoDate(-6));
      expect(recentDays[6]?.date).toBe(isoDate(0));
      expect(recentDays[5]).toMatchObject({ value: 8, met: true });
      expect(recentDays[6]).toMatchObject({ value: 4, met: false });
      expect(recentDays[0]).toMatchObject({ value: null, met: false });
    });
  });

  describe('the logging window', () => {
    it('accepts a week back and refuses further', async () => {
      const habit = await createHabit(WALK);

      await log(habit.id, isoDate(-7), 1).expect(200);

      const tooOld = await log(habit.id, isoDate(-8), 1).expect(400);
      expect((tooOld.body as { message: string }).message).toContain('7 днів');
    });

    it('tolerates a day ahead of UTC but refuses the future', async () => {
      const habit = await createHabit(WALK);

      await log(habit.id, isoDate(1), 1).expect(200);

      const future = await log(habit.id, isoDate(2), 1).expect(400);
      expect((future.body as { message: string }).message).toContain('майбутній');
    });
  });

  describe('tenancy', () => {
    it("answers for another trainer's client exactly like a nonexistent one", async () => {
      const foreign = await request(server())
        .get(`/clients/${clientId}/habits`)
        .set('Cookie', cookieB)
        .expect(404);
      const missing = await request(server())
        .get(`/clients/${NONEXISTENT_ID}/habits`)
        .set('Cookie', cookieB)
        .expect(404);

      expect(foreign.body).toEqual(missing.body);
    });

    it('refuses a foreign habit on update and delete, identically', async () => {
      const habit = await createHabit(WATER);

      const patched = await request(server())
        .patch(`/habits/${habit.id}`)
        .set('Cookie', cookieB)
        .send({ name: 'Викрадено' })
        .expect(404);
      const missing = await request(server())
        .patch(`/habits/${NONEXISTENT_ID}`)
        .set('Cookie', cookieB)
        .send({ name: 'Викрадено' })
        .expect(404);
      expect(patched.body).toEqual(missing.body);

      await request(server()).delete(`/habits/${habit.id}`).set('Cookie', cookieB).expect(404);
      expect(await harness.prisma.habit.count()).toBe(1);
    });

    it('puts a sibling client exactly as far away as a stranger', async () => {
      const habit = await createHabit(WALK);

      const sibling = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });
      const stranger = await createAcceptedClient(harness, cookieB, {
        fullName: 'Чужий Клієнт',
        email: 'foreign-client@example.com',
      });

      const bySibling = await log(habit.id, isoDate(0), 1, sibling.clientCookie).expect(404);
      const byStranger = await log(habit.id, isoDate(0), 1, stranger.clientCookie).expect(404);
      const missing = await log(NONEXISTENT_ID, isoDate(0), 1, sibling.clientCookie).expect(404);

      expect(bySibling.body).toEqual(missing.body);
      expect(byStranger.body).toEqual(missing.body);
      expect(await harness.prisma.habitLog.count()).toBe(0);

      // And the sibling's own view stays empty.
      expect((await mine(isoDate(0), sibling.clientCookie)).habits).toEqual([]);
    });

    it('keeps the two hats to their own routes', async () => {
      const asClient = await request(server())
        .get(`/clients/${clientId}/habits`)
        .set('Cookie', clientCookie)
        .expect(401);
      const anonymous = await request(server()).get(`/clients/${clientId}/habits`).expect(401);
      expect(asClient.body).toEqual(anonymous.body);

      const asTrainer = await request(server())
        .get('/me/habits')
        .set('Cookie', cookieA)
        .expect(401);
      expect(asTrainer.body).toEqual(anonymous.body);
    });

    it('cuts an archived client at the guard', async () => {
      await harness.prisma.client.update({
        where: { id: clientId },
        data: { status: 'ARCHIVED' },
      });

      await request(server()).get('/me/habits').set('Cookie', clientCookie).expect(401);
    });
  });

  describe('the trainer view', () => {
    it('sees the same shape the client does, including streaks', async () => {
      const habit = await createHabit(WALK);
      for (const offset of [-1, 0]) {
        await log(habit.id, isoDate(offset), 1).expect(200);
      }

      const view = (
        await request(server())
          .get(`/clients/${clientId}/habits?date=${isoDate(0)}`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body as HabitsView;

      const status = statusOf(view, 'Прогулянка');
      expect(status.currentStreak).toBe(2);
      expect(status.recentDays).toHaveLength(7);
      expect((status.today as HabitDay).met).toBe(true);
    });

    it('has no write path of its own for a day', async () => {
      const habit = await createHabit(WALK);

      // Habits are the client's act: there is simply no trainer route for it.
      await request(server())
        .put(`/habits/${habit.id}/logs/${isoDate(0)}`)
        .set('Cookie', cookieA)
        .send({ value: 1 })
        .expect(404);
    });
  });
});
