import request from 'supertest';

import type { NotificationList } from '@gart/shared';

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

describe('trainer messages', () => {
  let harness: Harness;
  let cookieA: string;
  let cookieB: string;
  let clientCookie: string;
  let clientId: string;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    process.env.MESSAGE_THROTTLE_LIMIT = '1000';
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
    delete process.env.MESSAGE_THROTTLE_LIMIT;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    harness.queue.reset();
    process.env.MESSAGE_THROTTLE_LIMIT = '1000';

    cookieA = await registerTrainer(harness, validRegistration);
    cookieB = await registerTrainer(harness, secondRegistration);

    const accepted = await createAcceptedClient(harness, cookieA);
    clientCookie = accepted.clientCookie;
    clientId = accepted.clientId;
  });

  const server = () => harness.app.getHttpServer();

  function send(text: string, cookie = cookieA, target = clientId) {
    return request(server())
      .post(`/clients/${target}/messages`)
      .set('Cookie', cookie)
      .send({ text });
  }

  async function inbox(cookie: string): Promise<NotificationList> {
    return (await request(server()).get('/notifications').set('Cookie', cookie).expect(200))
      .body as NotificationList;
  }

  it('reaches the client in-app and queues a push', async () => {
    await send('Не забудь про тренування завтра о 9:00').expect(201);

    const mine = await inbox(clientCookie);

    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({
      type: 'TRAINER_MESSAGE',
      title: 'Повідомлення від тренера',
      body: 'Не забудь про тренування завтра о 9:00',
    });
    expect(mine.unreadCount).toBe(1);

    expect(harness.queue.jobs).toHaveLength(1);
    expect(harness.queue.jobs[0]).toMatchObject({
      title: 'Повідомлення від тренера',
      body: 'Не забудь про тренування завтра о 9:00',
      url: '/client',
    });
  });

  it('does not echo into the trainer’s own feed', async () => {
    await send('Привіт').expect(201);

    expect((await inbox(cookieA)).items).toHaveLength(0);
  });

  it('carries text verbatim, with nowhere for markup to be interpreted', async () => {
    const text = '<script>alert(1)</script> та «лапки»';

    await send(text).expect(201);

    // Stored as written: React escapes it in the panel and the service worker
    // passes it to showNotification as a string.
    expect((await inbox(clientCookie)).items[0]?.body).toBe(text);
  });

  it("refuses another trainer's client exactly like a nonexistent one", async () => {
    const foreign = await send('Привіт', cookieB).expect(404);
    const missing = await send('Привіт', cookieB, NONEXISTENT_ID).expect(404);

    expect(foreign.body).toEqual(missing.body);
    expect(await harness.prisma.notification.count()).toBe(0);
  });

  it('is closed to clients and to anonymous callers', async () => {
    const asClient = await send('Привіт', clientCookie).expect(401);
    const anonymous = await request(server())
      .post(`/clients/${clientId}/messages`)
      .send({ text: 'Привіт' })
      .expect(401);

    expect(asClient.body).toEqual(anonymous.body);
  });

  it('validates the text', async () => {
    await send('').expect(400);
    await send('   ').expect(400);
    await send('я'.repeat(501)).expect(400);
    await send('я'.repeat(500)).expect(201);
  });

  it('rate limits per trainer, not per address', async () => {
    // Two trainers who have sent nothing yet, over the one address supertest
    // uses — which is exactly the case IP-based limiting gets wrong.
    const busy = await registerTrainer(harness, {
      ...validRegistration,
      email: 'busy@gart.fit',
    });
    const quiet = await registerTrainer(harness, {
      ...validRegistration,
      email: 'quiet@gart.fit',
    });
    const busyClient = await createAcceptedClient(harness, busy, {
      fullName: 'Клієнт Один',
      email: 'one@example.com',
    });
    const quietClient = await createAcceptedClient(harness, quiet, {
      fullName: 'Клієнт Два',
      email: 'two@example.com',
    });

    process.env.MESSAGE_THROTTLE_LIMIT = '2';

    await send('Перше', busy, busyClient.clientId).expect(201);
    await send('Друге', busy, busyClient.clientId).expect(201);
    await send('Третє', busy, busyClient.clientId).expect(429);

    // Same address, untouched budget: the limit follows the trainer.
    await send('Привіт', quiet, quietClient.clientId).expect(201);
  });
});
