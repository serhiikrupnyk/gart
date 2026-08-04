import request from 'supertest';

import type {
  ChatHistory,
  ChatMessage,
  ChatThreadSummary,
  NotificationList,
  PresignMediaResponse,
} from '@gart/shared';

import {
  createAcceptedClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
  validRegistration,
} from './app-harness';
import { MAGIC_FIXTURES } from './fake-storage';

const NONEXISTENT_ID = 'cl00000000000000000000000';

describe('chat media', () => {
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
    harness.storage.deletedKeys.length = 0;

    cookieA = await registerTrainer(harness, validRegistration);
    cookieB = await registerTrainer(harness, secondRegistration);

    const accepted = await createAcceptedClient(harness, cookieA);
    clientCookie = accepted.clientCookie;
    clientId = accepted.clientId;

    threadId = (
      (
        await request(harness.app.getHttpServer())
          .post('/chat/threads')
          .set('Cookie', cookieA)
          .send({ clientId })
          .expect(201)
      ).body as ChatThreadSummary
    ).id;
  });

  const server = () => harness.app.getHttpServer();

  function presign(body: Record<string, unknown>, cookie = clientCookie, thread = threadId) {
    return request(server())
      .post(`/chat/threads/${thread}/attachments/presign`)
      .set('Cookie', cookie)
      .send(body);
  }

  function send(body: Record<string, unknown>, cookie = clientCookie, thread = threadId) {
    return request(server())
      .post(`/chat/threads/${thread}/messages`)
      .set('Cookie', cookie)
      .send(body);
  }

  /** The whole Step 8 flow, scoped to a conversation. */
  async function upload(
    kind: 'VOICE' | 'IMAGE' | 'VIDEO',
    contentType: string,
    magic: Buffer,
    cookie = clientCookie,
  ): Promise<string> {
    const { key } = (await presign({ kind, contentType, sizeBytes: 2048 }, cookie).expect(201))
      .body as PresignMediaResponse;

    harness.storage.putObject(key, contentType, magic, 2048);

    return key;
  }

  async function history(cookie: string): Promise<ChatHistory> {
    return (
      await request(server())
        .get(`/chat/threads/${threadId}/messages`)
        .set('Cookie', cookie)
        .expect(200)
    ).body as ChatHistory;
  }

  describe('uploading into a conversation', () => {
    it('carries a voice message through history with metadata only', async () => {
      const key = await upload('VOICE', 'audio/webm', MAGIC_FIXTURES.webm);

      const sent = await send({
        attachment: { key, kind: 'VOICE', durationSeconds: 12 },
      }).expect(201);

      expect(sent.body as ChatMessage).toMatchObject({
        body: '',
        senderRole: 'CLIENT',
        attachment: {
          kind: 'VOICE',
          contentType: 'audio/webm',
          sizeBytes: 2048,
          durationSeconds: 12,
        },
      });

      const conversation = await history(cookieA);
      expect(conversation.messages).toHaveLength(1);
      // No key, and no URL either: history costs no egress.
      expect(JSON.stringify(conversation)).not.toContain(key);
      expect(JSON.stringify(conversation)).not.toContain('storage.test');
    });

    it('carries an image and a video, and text alongside media', async () => {
      const image = await upload('IMAGE', 'image/jpeg', MAGIC_FIXTURES.jpeg);
      await send({ body: 'Ось моя техніка', attachment: { key: image, kind: 'IMAGE' } }).expect(
        201,
      );

      const video = await upload('VIDEO', 'video/mp4', MAGIC_FIXTURES.mp4);
      await send({ attachment: { key: video, kind: 'VIDEO' } }).expect(201);

      const conversation = await history(cookieA);
      expect(conversation.messages.map((message) => message.attachment?.kind)).toEqual([
        'IMAGE',
        'VIDEO',
      ]);
      expect(conversation.messages[0]?.body).toBe('Ось моя техніка');
    });

    it('refuses a message that is neither text nor media', async () => {
      await send({}).expect(400);
      await send({ body: '   ' }).expect(400);
    });

    it('accepts only the types and sizes each kind allows', async () => {
      await presign({ kind: 'VOICE', contentType: 'application/pdf', sizeBytes: 2048 }).expect(400);
      await presign({ kind: 'IMAGE', contentType: 'video/mp4', sizeBytes: 2048 }).expect(400);
      await presign({
        kind: 'VOICE',
        contentType: 'audio/webm',
        sizeBytes: 6 * 1024 * 1024,
      }).expect(400);
      await presign({
        kind: 'VIDEO',
        contentType: 'video/mp4',
        sizeBytes: 40 * 1024 * 1024,
      }).expect(201);
    });

    it('verifies what actually landed, and cleans up when it does not', async () => {
      // A key belonging to another conversation.
      await send({
        attachment: { key: 'chat/somebody-else/x.jpg', kind: 'IMAGE' },
      }).expect(400);

      // Nothing was ever uploaded.
      const { key: missing } = (
        await presign({ kind: 'IMAGE', contentType: 'image/jpeg', sizeBytes: 2048 }).expect(201)
      ).body as PresignMediaResponse;
      await send({ attachment: { key: missing, kind: 'IMAGE' } }).expect(400);

      // Declared an image, uploaded something else entirely.
      const liar = await upload('IMAGE', 'image/jpeg', MAGIC_FIXTURES.garbage);
      await send({ attachment: { key: liar, kind: 'IMAGE' } }).expect(400);

      expect(harness.storage.deletedKeys).toContain(liar);
      expect(await harness.prisma.chatAttachment.count()).toBe(0);
      expect(await harness.prisma.chatMessage.count()).toBe(0);
    });

    it('rejects a duration beyond what a chat note can be', async () => {
      const key = await upload('VOICE', 'audio/webm', MAGIC_FIXTURES.webm);

      await send({ attachment: { key, kind: 'VOICE', durationSeconds: 601 } }).expect(400);
    });
  });

  describe('who may upload and who may look', () => {
    it('refuses another trainer a signature against this conversation', async () => {
      const foreign = await presign(
        { kind: 'IMAGE', contentType: 'image/jpeg', sizeBytes: 2048 },
        cookieB,
      ).expect(404);
      const missing = await presign(
        { kind: 'IMAGE', contentType: 'image/jpeg', sizeBytes: 2048 },
        cookieB,
        NONEXISTENT_ID,
      ).expect(404);

      expect(foreign.body).toEqual(missing.body);
    });

    it('refuses a sibling client of the same trainer', async () => {
      const sibling = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });

      await presign(
        { kind: 'IMAGE', contentType: 'image/jpeg', sizeBytes: 2048 },
        sibling.clientCookie,
      ).expect(404);
    });

    it('serves a view URL to both participants and to nobody else', async () => {
      const key = await upload('IMAGE', 'image/jpeg', MAGIC_FIXTURES.jpeg);
      const message = (await send({ attachment: { key, kind: 'IMAGE' } }).expect(201))
        .body as ChatMessage;
      const attachmentId = message.attachment?.id ?? '';

      for (const cookie of [cookieA, clientCookie]) {
        const response = await request(server())
          .get(`/chat/attachments/${attachmentId}/url`)
          .set('Cookie', cookie)
          .expect(200);

        // A presigned URL points at the object by design — that is what makes
        // it presigned. What must never leak is the key through the metadata
        // payloads, which the history test asserts.
        const body = response.body as { url: string; expiresAt: string };
        expect(body.url).toContain('storage.test/get/');
        expect(Object.keys(body).sort()).toEqual(['expiresAt', 'url']);
      }

      const sibling = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });

      const foreignTrainer = await request(server())
        .get(`/chat/attachments/${attachmentId}/url`)
        .set('Cookie', cookieB)
        .expect(404);
      const siblingClient = await request(server())
        .get(`/chat/attachments/${attachmentId}/url`)
        .set('Cookie', sibling.clientCookie)
        .expect(404);
      const missing = await request(server())
        .get(`/chat/attachments/${NONEXISTENT_ID}/url`)
        .set('Cookie', cookieB)
        .expect(404);

      expect(foreignTrainer.body).toEqual(missing.body);
      expect(siblingClient.body).toEqual(missing.body);

      await request(server()).get(`/chat/attachments/${attachmentId}/url`).expect(401);
    });
  });

  describe('delivery', () => {
    it('names the media in the notification when there are no words', async () => {
      const voice = await upload('VOICE', 'audio/webm', MAGIC_FIXTURES.webm);
      await send({ attachment: { key: voice, kind: 'VOICE' } }).expect(201);

      const forTrainer = (
        (await request(server()).get('/notifications').set('Cookie', cookieA).expect(200))
          .body as NotificationList
      ).items.filter((item) => item.type === 'CHAT_MESSAGE');

      expect(forTrainer[0]?.body).toBe('Повідомлення: Голосове повідомлення');

      const image = await upload('IMAGE', 'image/jpeg', MAGIC_FIXTURES.jpeg, cookieA);
      await send({ attachment: { key: image, kind: 'IMAGE' } }, cookieA).expect(201);

      const forClient = (
        (await request(server()).get('/notifications').set('Cookie', clientCookie).expect(200))
          .body as NotificationList
      ).items.filter((item) => item.type === 'CHAT_MESSAGE');

      expect(forClient[0]?.body).toBe('Фото');
    });

    it('prefers the words when there are any', async () => {
      const key = await upload('IMAGE', 'image/jpeg', MAGIC_FIXTURES.jpeg);
      await send({ body: 'Дивись', attachment: { key, kind: 'IMAGE' } }).expect(201);

      const items = (
        (await request(server()).get('/notifications').set('Cookie', cookieA).expect(200))
          .body as NotificationList
      ).items.filter((item) => item.type === 'CHAT_MESSAGE');

      expect(items[0]?.body).toBe('Повідомлення: Дивись');
    });
  });
});
