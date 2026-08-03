import request from 'supertest';

import type {
  NotificationList,
  PublicAssignmentDetail,
  PublicProgramDetail,
  PublicProgressVariable,
  PushPublicKeyResponse,
} from '@gart/shared';

import { PushDeliveryService } from '../src/notifications/push-delivery.service';
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
const ENDPOINT = 'https://push.example.com/subscription/abc';

function isoDate(offsetDays: number): string {
  const now = new Date();
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return new Date(utcToday + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe('notifications', () => {
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
    harness.queue.reset();
    harness.push.reset();

    cookieA = await registerTrainer(harness, validRegistration);
    cookieB = await registerTrainer(harness, secondRegistration);

    const accepted = await createAcceptedClient(harness, cookieA);
    clientCookie = accepted.clientCookie;
    clientId = accepted.clientId;
  });

  const server = () => harness.app.getHttpServer();

  async function list(cookie: string, query = ''): Promise<NotificationList> {
    return (await request(server()).get(`/notifications${query}`).set('Cookie', cookie).expect(200))
      .body as NotificationList;
  }

  /** Assigns a program, which is also the CLIENT-audience emission point. */
  async function assignProgram(): Promise<PublicAssignmentDetail> {
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
            name: 'Сила: день 1',
            type: 'STRENGTH',
            sections: [
              {
                type: 'STRENGTH',
                exercises: [
                  { exerciseId, sets: 3, reps: 5, loadValue: 80, loadUnit: 'KG' },
                  { exerciseId, sets: 2, reps: 8, loadValue: 60, loadUnit: 'KG' },
                ],
              },
            ],
          })
          .expect(201)
      ).body as PublicProgramDetail
    ).id;

    return (
      await request(server())
        .post(`/clients/${clientId}/assignments`)
        .set('Cookie', cookieA)
        .send({ programId, startDate: isoDate(-7), daysOfWeek: [1, 2, 3, 4, 5, 6, 7] })
        .expect(201)
    ).body as PublicAssignmentDetail;
  }

  function logExercise(exerciseLineId: string, body: Record<string, unknown>) {
    return request(server())
      .put(`/me/assignment-exercises/${exerciseLineId}/logs/${isoDate(0)}`)
      .set('Cookie', clientCookie)
      .send(body)
      .expect(200);
  }

  describe('the durable channel', () => {
    it('writes the row and queues exactly one push', async () => {
      await assignProgram();

      // The client is the recipient: their trainer gave them a programme.
      const mine = await list(clientCookie);
      expect(mine.items).toHaveLength(1);
      expect(mine.items[0]).toMatchObject({
        type: 'ASSIGNMENT_CREATED',
        title: 'Нова програма',
        body: 'Сила: день 1',
      });
      expect(mine.unreadCount).toBe(1);

      expect(harness.queue.jobs).toHaveLength(1);
      expect(harness.queue.jobs[0]).toMatchObject({ title: 'Нова програма', url: '/client' });
    });

    it('survives an unreachable queue: the notification still exists', async () => {
      harness.queue.failNext = true;

      // The action itself must succeed — Redis being down cannot cost a write.
      await assignProgram();

      const mine = await list(clientCookie);
      expect(mine.items).toHaveLength(1);
      expect(harness.queue.jobs).toHaveLength(0);
    });

    it('marks one read, and all read', async () => {
      await assignProgram();

      const [first] = (await list(clientCookie)).items;

      const read = await request(server())
        .patch(`/notifications/${first!.id}/read`)
        .set('Cookie', clientCookie)
        .expect(200);
      expect((read.body as { readAt: string | null }).readAt).not.toBeNull();
      expect((await list(clientCookie)).unreadCount).toBe(0);

      await request(server())
        .post('/notifications/read-all')
        .set('Cookie', clientCookie)
        .expect(204);
      expect((await list(clientCookie)).unreadCount).toBe(0);
    });

    it('pages a long stream', async () => {
      const assignment = await assignProgram();
      const lines = assignment.sections[0]!.exercises;

      // Twenty-five notifications for the trainer, one per skipped exercise
      // across many days.
      for (let day = 0; day < 25; day += 1) {
        await harness.prisma.notification.create({
          data: {
            userId: (await harness.prisma.trainer.findFirstOrThrow({ select: { userId: true } }))
              .userId,
            trainerId: (await harness.prisma.trainer.findFirstOrThrow()).id,
            clientId,
            audience: 'TRAINER',
            type: 'WORKOUT_LOGGED',
            title: `Подія ${String(day)}`,
          },
        });
      }
      expect(lines).toHaveLength(2);

      const firstPage = await list(cookieA);
      expect(firstPage.items).toHaveLength(20);
      expect(firstPage.total).toBe(25);

      const secondPage = await list(cookieA, '?page=2');
      expect(secondPage.items).toHaveLength(5);
    });
  });

  describe('scoping', () => {
    it('keeps each hat to its own stream', async () => {
      await assignProgram();

      // The assignment notified the CLIENT; the trainer's stream stays empty.
      expect((await list(cookieA)).items).toHaveLength(0);
      expect((await list(clientCookie)).items).toHaveLength(1);
    });

    it("never shows one trainer another's tenant", async () => {
      await assignProgram();
      const assignment = await assignProgram();
      await logExercise(assignment.sections[0]!.exercises[0]!.id, { completed: true, sets: [] });

      expect((await list(cookieA)).items.length).toBeGreaterThan(0);
      expect((await list(cookieB)).items).toHaveLength(0);
    });

    it('never shows one client a sibling client of the same trainer', async () => {
      await assignProgram();

      const sibling = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });

      expect((await list(sibling.clientCookie)).items).toHaveLength(0);
    });

    it("refuses to mark someone else's notification, identically to a missing one", async () => {
      await assignProgram();
      const [first] = (await list(clientCookie)).items;

      const foreign = await request(server())
        .patch(`/notifications/${first!.id}/read`)
        .set('Cookie', cookieB)
        .expect(404);
      const missing = await request(server())
        .patch(`/notifications/${NONEXISTENT_ID}/read`)
        .set('Cookie', cookieB)
        .expect(404);

      expect(foreign.body).toEqual(missing.body);
      expect((await list(clientCookie)).unreadCount).toBe(1);
    });

    it('turns anonymous callers away', async () => {
      await request(server()).get('/notifications').expect(401);
      await request(server()).post('/notifications/push/subscriptions').send({}).expect(401);
    });
  });

  describe('client activity reaches the trainer', () => {
    it('announces a session once, however many exercises are recorded', async () => {
      const assignment = await assignProgram();
      const [first, second] = assignment.sections[0]!.exercises;

      await logExercise(first!.id, { completed: true, sets: [{ reps: 5, loadKg: 80 }] });
      await logExercise(second!.id, { completed: true, sets: [{ reps: 8, loadKg: 60 }] });
      // Editing the first record must not announce anything either.
      await logExercise(first!.id, { completed: true, sets: [{ reps: 5, loadKg: 85 }] });

      const feed = await list(cookieA);
      const logged = feed.items.filter((item) => item.type === 'WORKOUT_LOGGED');

      expect(logged).toHaveLength(1);
      expect(logged[0]).toMatchObject({
        title: 'Марія Бондаренко',
        body: 'Запис тренування',
        clientId,
      });
    });

    it('announces a skip with the reason the trainer needs to read', async () => {
      const assignment = await assignProgram();
      const [first] = assignment.sections[0]!.exercises;

      await logExercise(first!.id, { completed: false, notes: 'біль у коліні', sets: [] });
      // Correcting the note does not announce it a second time.
      await logExercise(first!.id, { completed: false, notes: 'біль у коліні, лівому', sets: [] });

      const skips = (await list(cookieA)).items.filter((item) => item.type === 'EXERCISE_SKIPPED');

      expect(skips).toHaveLength(1);
      expect(skips[0]?.body).toBe('Пропуск вправи: біль у коліні');
    });

    it('announces a measurement the client took themselves', async () => {
      const variable = (
        await request(server())
          .post(`/clients/${clientId}/progress/variables`)
          .set('Cookie', cookieA)
          .send({ name: 'Вага', unit: 'кг', selfLog: true })
          .expect(201)
      ).body as PublicProgressVariable;

      // The trainer's own entry is already theirs — only the client's is news.
      await request(server())
        .put(`/progress/variables/${variable.id}/entries/${isoDate(-1)}`)
        .set('Cookie', cookieA)
        .send({ value: 84 })
        .expect(200);
      expect((await list(cookieA)).items).toHaveLength(0);

      await request(server())
        .put(`/me/progress/variables/${variable.id}/entries/${isoDate(0)}`)
        .set('Cookie', clientCookie)
        .send({ value: 83.2 })
        .expect(200);

      const [entry] = (await list(cookieA)).items;
      expect(entry).toMatchObject({ type: 'PROGRESS_LOGGED', body: 'Новий замір: Вага 83.2 кг' });
    });

    it('announces a habit at a milestone and stays quiet before it', async () => {
      const habit = (
        await request(server())
          .post(`/clients/${clientId}/habits`)
          .set('Cookie', cookieA)
          .send({ name: 'Вода', kind: 'CHECK' })
          .expect(201)
      ).body as { id: string };

      // Six days is not a milestone; the seventh is.
      for (const offset of [-6, -5, -4, -3, -2, -1]) {
        await request(server())
          .put(`/me/habits/${habit.id}/logs/${isoDate(offset)}`)
          .set('Cookie', clientCookie)
          .send({ value: 1 })
          .expect(200);
      }
      expect((await list(cookieA)).items).toHaveLength(0);

      await request(server())
        .put(`/me/habits/${habit.id}/logs/${isoDate(0)}`)
        .set('Cookie', clientCookie)
        .send({ value: 1 })
        .expect(200);

      const [milestone] = (await list(cookieA)).items;
      expect(milestone).toMatchObject({
        type: 'HABIT_STREAK',
        body: 'Серія звички: Вода — 7 днів поспіль',
      });
    });
  });

  describe('push subscriptions', () => {
    function subscribe(cookie: string, endpoint = ENDPOINT) {
      return request(server())
        .post('/notifications/push/subscriptions')
        .set('Cookie', cookie)
        .send({ endpoint, p256dh: 'key-material', auth: 'auth-secret', userAgent: 'Firefox' });
    }

    it('serves the public key rather than bundling it', async () => {
      const response = await request(server())
        .get('/notifications/push/key')
        .set('Cookie', cookieA)
        .expect(200);

      expect((response.body as PushPublicKeyResponse).publicKey).toBe('test-vapid-public-key');
    });

    it('stores a subscription, refreshes it on re-subscribe, and removes it', async () => {
      await subscribe(clientCookie).expect(204);
      await subscribe(clientCookie).expect(204);

      expect(await harness.prisma.pushSubscription.count()).toBe(1);

      await request(server())
        .post('/notifications/push/unsubscribe')
        .set('Cookie', clientCookie)
        .send({ endpoint: ENDPOINT })
        .expect(204);

      expect(await harness.prisma.pushSubscription.count()).toBe(0);
    });

    it('rejects an endpoint that is not an https URL', async () => {
      await request(server())
        .post('/notifications/push/subscriptions')
        .set('Cookie', clientCookie)
        .send({ endpoint: 'http://push.example.com/x', p256dh: 'k', auth: 'a' })
        .expect(400);
      await request(server())
        .post('/notifications/push/subscriptions')
        .set('Cookie', clientCookie)
        .send({ endpoint: 'javascript:alert(1)', p256dh: 'k', auth: 'a' })
        .expect(400);
    });

    it("cannot remove another user's device", async () => {
      await subscribe(clientCookie).expect(204);

      await request(server())
        .post('/notifications/push/unsubscribe')
        .set('Cookie', cookieB)
        .send({ endpoint: ENDPOINT })
        .expect(204);

      expect(await harness.prisma.pushSubscription.count()).toBe(1);
    });
  });

  describe('delivery', () => {
    async function subscribeUser(cookie: string, endpoint: string): Promise<void> {
      await request(server())
        .post('/notifications/push/subscriptions')
        .set('Cookie', cookie)
        .send({ endpoint, p256dh: 'key-material', auth: 'auth-secret' })
        .expect(204);
    }

    function deliver(userId: string) {
      return harness.app
        .get(PushDeliveryService)
        .deliver({ userId, title: 'Заголовок', body: 'Текст', url: '/client' });
    }

    async function clientUserId(): Promise<string> {
      const client = await harness.prisma.client.findUniqueOrThrow({
        where: { id: clientId },
        select: { userId: true },
      });

      return client.userId ?? '';
    }

    it('sends to every device the user agreed on', async () => {
      await subscribeUser(clientCookie, ENDPOINT);
      await subscribeUser(clientCookie, `${ENDPOINT}-2`);

      await deliver(await clientUserId());

      expect(harness.push.sent).toHaveLength(2);
      expect(harness.push.sent[0]?.payload).toMatchObject({ title: 'Заголовок', url: '/client' });
    });

    it('prunes a subscription the push service says is gone', async () => {
      await subscribeUser(clientCookie, ENDPOINT);
      harness.push.failures.set(ENDPOINT, 410);

      await deliver(await clientUserId());

      expect(await harness.prisma.pushSubscription.count()).toBe(0);
    });

    it('prunes on 404 as well', async () => {
      await subscribeUser(clientCookie, ENDPOINT);
      harness.push.failures.set(ENDPOINT, 404);

      await deliver(await clientUserId());

      expect(await harness.prisma.pushSubscription.count()).toBe(0);
    });

    it('keeps a good subscription when the push service merely fails', async () => {
      await subscribeUser(clientCookie, ENDPOINT);
      harness.push.failures.set(ENDPOINT, 500);

      // A transient failure is rethrown so the job retries — and the device
      // stays subscribed.
      await expect(deliver(await clientUserId())).rejects.toThrow();
      expect(await harness.prisma.pushSubscription.count()).toBe(1);
    });

    it('does nothing at all for a user with no devices', async () => {
      await deliver(await clientUserId());

      expect(harness.push.sent).toHaveLength(0);
    });
  });

  describe('health', () => {
    it('reports the queue without calling the service unhealthy', async () => {
      const ok = await request(server()).get('/health').expect(200);
      expect(ok.body).toEqual({ status: 'ok', db: 'ok', queue: 'ok' });

      harness.queue.ready = false;

      const degraded = await request(server()).get('/health').expect(200);
      expect(degraded.body).toEqual({ status: 'ok', db: 'ok', queue: 'error' });
    });
  });
});
