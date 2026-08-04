import { firstValueFrom, take, toArray } from 'rxjs';
import request from 'supertest';

import type {
  ChatHistory,
  ChatMessage,
  ChatStreamEvent,
  ChatThreadSummary,
  NotificationList,
} from '@gart/shared';

import { ChatStream } from '../src/chat/chat-stream.service';
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

describe('chat', () => {
  let harness: Harness;
  let cookieA: string;
  let cookieB: string;
  let clientCookie: string;
  let clientId: string;
  let threadId: string;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    process.env.CHAT_THROTTLE_LIMIT = '1000';
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
    delete process.env.CHAT_THROTTLE_LIMIT;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    harness.queue.reset();
    process.env.CHAT_THROTTLE_LIMIT = '1000';

    cookieA = await registerTrainer(harness, validRegistration);
    cookieB = await registerTrainer(harness, secondRegistration);

    const accepted = await createAcceptedClient(harness, cookieA);
    clientCookie = accepted.clientCookie;
    clientId = accepted.clientId;

    threadId = (await openThread()).id;
  });

  const server = () => harness.app.getHttpServer();
  const stream = () => harness.app.get(ChatStream);

  async function openThread(cookie = cookieA, target = clientId): Promise<ChatThreadSummary> {
    return (
      await request(server())
        .post('/chat/threads')
        .set('Cookie', cookie)
        .send({ clientId: target })
        .expect(201)
    ).body as ChatThreadSummary;
  }

  function send(body: string, cookie: string, thread = threadId) {
    return request(server())
      .post(`/chat/threads/${thread}/messages`)
      .set('Cookie', cookie)
      .send({ body });
  }

  async function history(cookie: string, query = '', thread = threadId): Promise<ChatHistory> {
    return (
      await request(server())
        .get(`/chat/threads/${thread}/messages${query}`)
        .set('Cookie', cookie)
        .expect(200)
    ).body as ChatHistory;
  }

  async function notifications(cookie: string): Promise<NotificationList['items']> {
    const body = (await request(server()).get('/notifications').set('Cookie', cookie).expect(200))
      .body as NotificationList;

    return body.items.filter((item) => item.type === 'CHAT_MESSAGE');
  }

  describe('threads', () => {
    it('opens the same conversation every time', async () => {
      const again = await openThread();

      expect(again.id).toBe(threadId);
      expect(again.title).toBe('Марія Бондаренко');
      expect(await harness.prisma.chatThread.count()).toBe(1);
    });

    it('gives the client their single conversation, naming their trainer', async () => {
      const mine = (
        await request(server()).get('/chat/thread').set('Cookie', clientCookie).expect(200)
      ).body as ChatThreadSummary;

      expect(mine.id).toBe(threadId);
      expect(mine.title).toBe('Олена Ковальчук');
    });

    it("refuses a thread with another trainer's client, identically to a nonexistent one", async () => {
      const foreign = await request(server())
        .post('/chat/threads')
        .set('Cookie', cookieB)
        .send({ clientId })
        .expect(404);
      const missing = await request(server())
        .post('/chat/threads')
        .set('Cookie', cookieB)
        .send({ clientId: NONEXISTENT_ID })
        .expect(404);

      expect(foreign.body).toEqual(missing.body);
    });

    it('lists a trainer only their own threads, newest conversation first', async () => {
      const second = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });
      const secondThread = await openThread(cookieA, second.clientId);

      await send('Привіт', cookieA, secondThread.id).expect(201);

      const threads = (
        await request(server()).get('/chat/threads').set('Cookie', cookieA).expect(200)
      ).body as ChatThreadSummary[];

      expect(threads.map((thread) => thread.id)).toEqual([secondThread.id, threadId]);
      expect(
        (await request(server()).get('/chat/threads').set('Cookie', cookieB).expect(200)).body,
      ).toEqual([]);
    });
  });

  describe('messages', () => {
    it('persists and reads back oldest first', async () => {
      const sent = await send('Привіт, як справи?', cookieA).expect(201);
      expect((sent.body as ChatMessage).senderRole).toBe('TRAINER');

      await send('Добре, дякую', clientCookie).expect(201);

      const conversation = await history(cookieA);

      expect(conversation.messages.map((message) => message.body)).toEqual([
        'Привіт, як справи?',
        'Добре, дякую',
      ]);
      expect(conversation.messages.map((message) => message.senderRole)).toEqual([
        'TRAINER',
        'CLIENT',
      ]);
    });

    it('pages backwards through a long conversation', async () => {
      for (let index = 0; index < 35; index += 1) {
        await send(`Повідомлення ${String(index)}`, cookieA).expect(201);
      }

      const newest = await history(cookieA);
      expect(newest.messages).toHaveLength(30);
      expect(newest.messages[0]?.body).toBe('Повідомлення 5');
      expect(newest.nextBefore).not.toBeNull();

      const older = await history(cookieA, `?before=${newest.nextBefore ?? ''}`);
      expect(older.messages).toHaveLength(5);
      expect(older.messages[0]?.body).toBe('Повідомлення 0');
      expect(older.nextBefore).toBeNull();
    });

    it('validates the body', async () => {
      await send('', cookieA).expect(400);
      await send('   ', cookieA).expect(400);
      await send('я'.repeat(2001), cookieA).expect(400);
      await send('я'.repeat(2000), cookieA).expect(201);
    });

    it('limits how fast one participant can send', async () => {
      process.env.CHAT_THROTTLE_LIMIT = '2';

      await send('Перше', clientCookie).expect(201);
      await send('Друге', clientCookie).expect(201);
      await send('Третє', clientCookie).expect(429);

      // The other participant has their own budget.
      await send('Від тренера', cookieA).expect(201);
    });
  });

  describe('participation', () => {
    it('hides a thread from another trainer exactly like a nonexistent one', async () => {
      const foreign = await request(server())
        .get(`/chat/threads/${threadId}/messages`)
        .set('Cookie', cookieB)
        .expect(404);
      const missing = await request(server())
        .get(`/chat/threads/${NONEXISTENT_ID}/messages`)
        .set('Cookie', cookieB)
        .expect(404);

      expect(foreign.body).toEqual(missing.body);
    });

    it('hides a thread from a sibling client of the same trainer', async () => {
      const sibling = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });

      const refused = await request(server())
        .get(`/chat/threads/${threadId}/messages`)
        .set('Cookie', sibling.clientCookie)
        .expect(404);
      const missing = await request(server())
        .get(`/chat/threads/${NONEXISTENT_ID}/messages`)
        .set('Cookie', sibling.clientCookie)
        .expect(404);

      expect(refused.body).toEqual(missing.body);
      await send('Підслухано', sibling.clientCookie).expect(404);
    });

    it('turns anonymous callers away from every route, stream included', async () => {
      await request(server()).get('/chat/threads').expect(401);
      await request(server()).get(`/chat/threads/${threadId}/messages`).expect(401);
      await request(server()).get(`/chat/threads/${threadId}/stream`).expect(401);
      await request(server())
        .post(`/chat/threads/${threadId}/messages`)
        .send({ body: 'x' })
        .expect(401);
    });

    it('refuses a stream for a thread that is not the caller’s', async () => {
      const foreign = await request(server())
        .get(`/chat/threads/${threadId}/stream`)
        .set('Cookie', cookieB)
        .expect(404);
      const missing = await request(server())
        .get(`/chat/threads/${NONEXISTENT_ID}/stream`)
        .set('Cookie', cookieB)
        .expect(404);

      expect(foreign.body).toEqual(missing.body);
    });
  });

  describe('read state', () => {
    it('counts only what the other side said since I last looked', async () => {
      await send('Раз', cookieA).expect(201);
      await send('Два', cookieA).expect(201);

      // The sender never has unread messages of their own.
      expect((await history(cookieA)).unreadCount).toBe(0);
      expect((await history(clientCookie)).unreadCount).toBe(2);

      await request(server())
        .post(`/chat/threads/${threadId}/read`)
        .set('Cookie', clientCookie)
        .expect(204);

      expect((await history(clientCookie)).unreadCount).toBe(0);
      // Marking one side read leaves the other side's count alone.
      await send('Три', clientCookie).expect(201);
      expect((await history(cookieA)).unreadCount).toBe(1);
    });

    it('treats sending as reading', async () => {
      await send('Питання', cookieA).expect(201);
      await send('Відповідь', clientCookie).expect(201);

      expect((await history(clientCookie)).unreadCount).toBe(0);
    });
  });

  describe('live delivery', () => {
    it('delivers a message to a listener on that thread', async () => {
      const received = firstValueFrom(stream().subscribe(threadId, 'CLIENT'));

      await send('Живе повідомлення', cookieA).expect(201);

      const event = await received;
      expect(event.message.body).toBe('Живе повідомлення');
      expect(event.threadId).toBe(threadId);
    });

    it('NEVER hands a listener another conversation’s message', async () => {
      const other = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });
      const otherThread = await openThread(cookieA, other.clientId);

      // Collect the first two events this listener sees, then send one message
      // to the other thread and two to theirs. If isolation leaked, the first
      // event collected would be the foreign one.
      const collected = firstValueFrom(
        stream().subscribe(threadId, 'CLIENT').pipe(take(2), toArray()),
      );

      await send('Чуже', cookieA, otherThread.id).expect(201);
      await send('Своє перше', cookieA).expect(201);
      await send('Своє друге', cookieA).expect(201);

      const events: ChatStreamEvent[] = await collected;

      expect(events.map((event) => event.message.body)).toEqual(['Своє перше', 'Своє друге']);
      expect(events.every((event) => event.threadId === threadId)).toBe(true);
    });

    it('reports who is watching, and forgets them when they leave', () => {
      expect(stream().isWatching(threadId, 'CLIENT')).toBe(false);

      const subscription = stream().subscribe(threadId, 'CLIENT').subscribe();
      expect(stream().isWatching(threadId, 'CLIENT')).toBe(true);
      expect(stream().isWatching(threadId, 'TRAINER')).toBe(false);

      subscription.unsubscribe();
      expect(stream().isWatching(threadId, 'CLIENT')).toBe(false);
    });
  });

  describe('notifying only who is not watching', () => {
    it('notifies an absent recipient, in-app and by push', async () => {
      await send('Ти де?', cookieA).expect(201);

      const forClient = await notifications(clientCookie);
      expect(forClient).toHaveLength(1);
      expect(forClient[0]).toMatchObject({
        title: 'Повідомлення від тренера',
        body: 'Ти де?',
      });
      expect(harness.queue.jobs).toHaveLength(1);

      // And in the other direction, naming the client.
      await send('Тут', clientCookie).expect(201);
      const forTrainer = await notifications(cookieA);
      expect(forTrainer[0]).toMatchObject({
        title: 'Марія Бондаренко',
        body: 'Повідомлення: Тут',
      });
    });

    it('does not notify someone who has the conversation open', async () => {
      const subscription = stream().subscribe(threadId, 'CLIENT').subscribe();

      await send('Бачиш це наживо', cookieA).expect(201);

      expect(await notifications(clientCookie)).toHaveLength(0);
      expect(harness.queue.jobs).toHaveLength(0);

      subscription.unsubscribe();

      // Once they close it, the next message notifies again.
      await send('А це вже ні', cookieA).expect(201);
      expect(await notifications(clientCookie)).toHaveLength(1);
    });

    it('never notifies the sender', async () => {
      await send('Сам собі', cookieA).expect(201);

      expect(await notifications(cookieA)).toHaveLength(0);
    });

    it('shortens a long message into a preview', async () => {
      await send('я'.repeat(200), cookieA).expect(201);

      const [notification] = await notifications(clientCookie);
      expect(notification?.body).toBe(`${'я'.repeat(80)}…`);
    });
  });

  describe('without any real-time at all', () => {
    it('sends and reads history with no stream open and the queue down', async () => {
      harness.queue.failNext = true;

      await send('Через HTTP', cookieA).expect(201);

      const conversation = await history(clientCookie);
      expect(conversation.messages.map((message) => message.body)).toEqual(['Через HTTP']);
      // The durable notification still exists; only the push was lost.
      expect(await notifications(clientCookie)).toHaveLength(1);
    });
  });
});
