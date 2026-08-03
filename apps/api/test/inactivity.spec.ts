import request from 'supertest';

import type { NotificationList, PublicProgramDetail } from '@gart/shared';

import { InactivityService } from '../src/notifications/inactivity.service';
import {
  createAcceptedClient,
  createClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
  validRegistration,
} from './app-harness';

function isoDate(offsetDays: number): string {
  const now = new Date();
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return new Date(utcToday + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function asDate(offsetDays: number): Date {
  return new Date(`${isoDate(offsetDays)}T00:00:00.000Z`);
}

describe('inactivity alerts', () => {
  let harness: Harness;
  let cookieA: string;
  let cookieB: string;
  let clientCookie: string;
  let clientId: string;
  let habitId: string;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    harness.queue.reset();

    cookieA = await registerTrainer(harness, validRegistration);
    cookieB = await registerTrainer(harness, secondRegistration);

    const accepted = await createAcceptedClient(harness, cookieA);
    clientCookie = accepted.clientCookie;
    clientId = accepted.clientId;

    // Something to be silent about: one habit is enough to be eligible.
    habitId = (
      (
        await request(harness.app.getHttpServer())
          .post(`/clients/${clientId}/habits`)
          .set('Cookie', cookieA)
          .send({ name: 'Вода', kind: 'CHECK' })
          .expect(201)
      ).body as { id: string }
    ).id;

    // Taken on long enough ago that the creation anchor is not what saves them.
    await harness.prisma.client.update({
      where: { id: clientId },
      data: { createdAt: asDate(-60) },
    });
  });

  const server = () => harness.app.getHttpServer();
  const sweep = () => harness.app.get(InactivityService).sweep();

  async function alerts(cookie = cookieA): Promise<NotificationList['items']> {
    const body = (await request(server()).get('/notifications').set('Cookie', cookie).expect(200))
      .body as NotificationList;

    return body.items.filter((item) => item.type === 'CLIENT_INACTIVE');
  }

  /** Records a habit day directly, so the window is not limited by the log rule. */
  async function recordHabit(offsetDays: number): Promise<void> {
    await harness.prisma.habitLog.create({
      data: { habitId, date: asDate(offsetDays), value: 1 },
    });
  }

  describe('the rule', () => {
    it('flags a client who has recorded nothing for more than a week', async () => {
      await recordHabit(-9);

      expect(await sweep()).toBe(1);

      const [alert] = await alerts();
      expect(alert).toMatchObject({
        type: 'CLIENT_INACTIVE',
        title: 'Марія Бондаренко',
        body: 'Немає активності: 9 днів',
        clientId,
      });
    });

    it('leaves a client exactly at the threshold alone', async () => {
      await recordHabit(-7);

      expect(await sweep()).toBe(0);
      expect(await alerts()).toHaveLength(0);
    });

    it('counts a habit, a workout and a measurement all as activity', async () => {
      // A habit eight days ago would flag them; each of these should not.
      await recordHabit(-9);

      const variable = (
        (
          await request(server())
            .post(`/clients/${clientId}/progress/variables`)
            .set('Cookie', cookieA)
            .send({ name: 'Вага', unit: 'кг' })
            .expect(201)
        ).body as { id: string }
      ).id;
      await request(server())
        .put(`/progress/variables/${variable}/entries/${isoDate(-2)}`)
        .set('Cookie', cookieA)
        .send({ value: 82 })
        .expect(200);

      expect(await sweep()).toBe(0);
    });

    it('never flags a client with nothing to be doing', async () => {
      await harness.prisma.habit.delete({ where: { id: habitId } });

      // No habits, no assignment: the silence is the trainer's backlog.
      expect(await sweep()).toBe(0);
    });

    it('counts a completed plan as something to do, and an archived one as nothing', async () => {
      await harness.prisma.habit.delete({ where: { id: habitId } });

      const exerciseId = (
        await harness.prisma.exercise.create({
          data: { name: 'Присідання', primaryMuscleGroup: 'LEGS', muscleGroups: [] },
        })
      ).id;
      const programId = (
        (
          await request(server())
            .post('/programs')
            .set('Cookie', cookieA)
            .send({
              name: 'Сила',
              type: 'STRENGTH',
              sections: [{ type: 'STRENGTH', exercises: [{ exerciseId, sets: 3, reps: 5 }] }],
            })
            .expect(201)
        ).body as PublicProgramDetail
      ).id;

      const assignment = (
        await request(server())
          .post(`/clients/${clientId}/assignments`)
          .set('Cookie', cookieA)
          .send({ programId, startDate: isoDate(-30), daysOfWeek: [1, 2, 3, 4, 5, 6, 7] })
          .expect(201)
      ).body as { id: string };

      // The assignment itself notified the client, not the trainer.
      await request(server())
        .patch(`/assignments/${assignment.id}`)
        .set('Cookie', cookieA)
        .send({ status: 'COMPLETED' })
        .expect(200);
      expect(await sweep()).toBe(1);

      await harness.prisma.notification.deleteMany({ where: { type: 'CLIENT_INACTIVE' } });
      await request(server())
        .patch(`/assignments/${assignment.id}`)
        .set('Cookie', cookieA)
        .send({ status: 'ARCHIVED' })
        .expect(200);

      expect(await sweep()).toBe(0);
    });

    it('skips clients who cannot log in or are no longer coached', async () => {
      // Invited but never accepted: no account, so no activity is possible.
      const invited = await createClient(harness, cookieA, {
        fullName: 'Запрошений Клієнт',
        email: 'invited@example.com',
      });
      await request(server())
        .post(`/clients/${invited.client.id}/habits`)
        .set('Cookie', cookieA)
        .send({ name: 'Вода', kind: 'CHECK' })
        .expect(201);

      await harness.prisma.client.update({
        where: { id: clientId },
        data: { status: 'ARCHIVED' },
      });

      expect(await sweep()).toBe(0);
    });

    it('judges a client who has never recorded anything from when they were taken on', async () => {
      // Taken on two days ago: not silent long enough yet.
      await harness.prisma.client.update({
        where: { id: clientId },
        data: { createdAt: asDate(-2) },
      });
      expect(await sweep()).toBe(0);

      await harness.prisma.client.update({
        where: { id: clientId },
        data: { createdAt: asDate(-20) },
      });
      expect(await sweep()).toBe(1);
    });
  });

  describe('one alert per episode', () => {
    it('does not nag on the following days', async () => {
      await recordHabit(-9);

      expect(await sweep()).toBe(1);
      expect(await sweep()).toBe(0);
      expect(await sweep()).toBe(0);

      expect(await alerts()).toHaveLength(1);
    });

    it('alerts again after the client returns and lapses once more', async () => {
      await recordHabit(-20);
      expect(await sweep()).toBe(1);

      // That alert really fired back then, so date it accordingly — the whole
      // story spans weeks, and only a test compresses it into one second.
      await harness.prisma.notification.updateMany({
        where: { type: 'CLIENT_INACTIVE' },
        data: { createdAt: asDate(-12) },
      });

      // They came back on day -9, then went quiet again: the episode anchor
      // has moved past the old alert, so this is a new lapse.
      await recordHabit(-9);
      expect(await sweep()).toBe(1);

      expect(await alerts()).toHaveLength(2);
      expect((await alerts())[0]?.body).toBe('Немає активності: 9 днів');
    });

    it('stays quiet once they are genuinely back', async () => {
      await recordHabit(-9);
      expect(await sweep()).toBe(1);

      await recordHabit(0);
      expect(await sweep()).toBe(0);
    });
  });

  describe('tenancy', () => {
    it('reaches only the trainer who coaches them', async () => {
      await recordHabit(-9);
      await sweep();

      expect(await alerts(cookieA)).toHaveLength(1);
      expect(await alerts(cookieB)).toHaveLength(0);
    });

    it('never reaches the client themselves', async () => {
      await recordHabit(-9);
      await sweep();

      const mine = (
        await request(server()).get('/notifications').set('Cookie', clientCookie).expect(200)
      ).body as NotificationList;

      expect(mine.items).toHaveLength(0);
    });

    it('queues a push for the trainer alongside the in-app alert', async () => {
      await recordHabit(-9);
      await sweep();

      expect(harness.queue.jobs).toHaveLength(1);
      expect(harness.queue.jobs[0]).toMatchObject({
        title: 'Марія Бондаренко',
        url: `/dashboard/clients/${clientId}`,
      });
    });

    it('still records the alert when the queue is unreachable', async () => {
      await recordHabit(-9);
      harness.queue.failNext = true;

      expect(await sweep()).toBe(1);
      expect(await alerts()).toHaveLength(1);
    });
  });
});
