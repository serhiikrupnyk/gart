import request from 'supertest';

import type { PresignMediaResponse, PublicExercise } from '@gart/shared';

import {
  PRESIGNED_GET_TTL_SECONDS,
  PRESIGNED_PUT_TTL_SECONDS,
} from '../src/storage/storage.service';
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

describe('exercise media', () => {
  let harness: Harness;
  let cookieA: string;
  let cookieB: string;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    harness.storage.objects.clear();
    harness.storage.presignedPuts.length = 0;
    harness.storage.deletedKeys.length = 0;
    cookieA = await registerTrainer(harness, validRegistration);
    cookieB = await registerTrainer(harness, secondRegistration);
  });

  function createExercise(cookie: string, name = 'Вправа з відео'): Promise<string> {
    return request(harness.app.getHttpServer())
      .post('/exercises')
      .set('Cookie', cookie)
      .send({ name, primaryMuscleGroup: 'LEGS' })
      .expect(201)
      .then((response) => (response.body as { id: string }).id);
  }

  function presign(
    cookie: string,
    exerciseId: string,
    body: Record<string, unknown> = {
      kind: 'VIDEO',
      contentType: 'video/mp4',
      sizeBytes: 1024,
    },
  ) {
    return request(harness.app.getHttpServer())
      .post(`/exercises/${exerciseId}/media/presign`)
      .set('Cookie', cookie)
      .send(body);
  }

  /** Presign, simulate the direct-to-storage PUT, finalize. */
  async function uploadVideo(cookie: string, exerciseId: string): Promise<string> {
    const presigned = (await presign(cookie, exerciseId).expect(200)).body as PresignMediaResponse;

    harness.storage.putObject(presigned.key, 'video/mp4', MAGIC_FIXTURES.mp4, 1024);

    await request(harness.app.getHttpServer())
      .post(`/exercises/${exerciseId}/media`)
      .set('Cookie', cookie)
      .send({ kind: 'VIDEO', key: presigned.key })
      .expect(201);

    return presigned.key;
  }

  describe('presign', () => {
    it('authorises an upload for an own exercise under a bound random key', async () => {
      const exerciseId = await createExercise(cookieA);

      const response = await presign(cookieA, exerciseId).expect(200);
      const body = response.body as PresignMediaResponse;

      expect(body.uploadUrl).toContain('storage.test/put/');
      expect(body.key).toMatch(new RegExp(`^exercises/${exerciseId}/video/[A-Za-z0-9_-]+\\.mp4$`));

      // The constraints the storage layer will enforce are exactly the declared ones.
      expect(harness.storage.presignedPuts).toEqual([
        { key: body.key, contentType: 'video/mp4', sizeBytes: 1024 },
      ]);

      // Short-lived: expiry sits at now + PUT TTL, give or take the test itself.
      const msUntilExpiry = new Date(body.expiresAt).getTime() - Date.now();
      expect(msUntilExpiry).toBeGreaterThan((PRESIGNED_PUT_TTL_SECONDS - 60) * 1000);
      expect(msUntilExpiry).toBeLessThanOrEqual(PRESIGNED_PUT_TTL_SECONDS * 1000);
    });

    it('refuses foreign and global exercises exactly like nonexistent ones', async () => {
      const foreign = await createExercise(cookieB, 'Чужа вправа');
      const globalRow = await harness.prisma.exercise.create({
        data: { name: 'Глобальна', primaryMuscleGroup: 'CHEST', muscleGroups: [] },
      });

      const foreignResponse = await presign(cookieA, foreign).expect(404);
      const globalResponse = await presign(cookieA, globalRow.id).expect(404);
      const missingResponse = await presign(cookieA, NONEXISTENT_ID).expect(404);

      expect(foreignResponse.body).toEqual(missingResponse.body);
      expect(globalResponse.body).toEqual(missingResponse.body);
      expect(harness.storage.presignedPuts).toHaveLength(0);
    });

    it.each([
      ['an SVG', { kind: 'VIDEO', contentType: 'image/svg+xml', sizeBytes: 100 }],
      [
        'a video type on the audio kind',
        { kind: 'AUDIO', contentType: 'video/mp4', sizeBytes: 100 },
      ],
      ['an unknown container', { kind: 'VIDEO', contentType: 'video/x-matroska', sizeBytes: 100 }],
    ])('rejects %s', async (_label, body) => {
      const exerciseId = await createExercise(cookieA);

      await presign(cookieA, exerciseId, body).expect(400);
      expect(harness.storage.presignedPuts).toHaveLength(0);
    });

    it('rejects an oversized declaration at presign, before any upload', async () => {
      const exerciseId = await createExercise(cookieA);

      await presign(cookieA, exerciseId, {
        kind: 'VIDEO',
        contentType: 'video/mp4',
        sizeBytes: 101 * 1024 * 1024,
      }).expect(400);
      await presign(cookieA, exerciseId, {
        kind: 'AUDIO',
        contentType: 'audio/mpeg',
        sizeBytes: 21 * 1024 * 1024,
      }).expect(400);

      expect(harness.storage.presignedPuts).toHaveLength(0);
    });
  });

  describe('finalize', () => {
    it('records the media and surfaces it on the exercise, without the key', async () => {
      const exerciseId = await createExercise(cookieA);
      await uploadVideo(cookieA, exerciseId);

      const exercise = (
        await request(harness.app.getHttpServer())
          .get(`/exercises/${exerciseId}`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body as PublicExercise;

      expect(exercise.media).toEqual([
        {
          kind: 'VIDEO',
          contentType: 'video/mp4',
          sizeBytes: 1024,
          uploadedAt: expect.any(String) as unknown,
        },
      ]);
      expect(JSON.stringify(exercise)).not.toContain('exercises/');
    });

    it('rejects a finalize for an object that never arrived', async () => {
      const exerciseId = await createExercise(cookieA);
      const presigned = (await presign(cookieA, exerciseId).expect(200))
        .body as PresignMediaResponse;

      await request(harness.app.getHttpServer())
        .post(`/exercises/${exerciseId}/media`)
        .set('Cookie', cookieA)
        .send({ kind: 'VIDEO', key: presigned.key })
        .expect(400);

      expect(await harness.prisma.exerciseMedia.count()).toBe(0);
    });

    it.each([
      ['a type outside the allowlist', 'text/html', MAGIC_FIXTURES.mp4, 1024],
      ['bytes that do not match the declared type', 'video/mp4', MAGIC_FIXTURES.mp3, 1024],
      ['an object over the cap', 'video/mp4', MAGIC_FIXTURES.mp4, 101 * 1024 * 1024],
    ])('rejects %s and deletes the stray object', async (_label, storedType, bytes, sizeBytes) => {
      const exerciseId = await createExercise(cookieA);
      const presigned = (await presign(cookieA, exerciseId).expect(200))
        .body as PresignMediaResponse;

      harness.storage.putObject(presigned.key, storedType, bytes, sizeBytes);

      await request(harness.app.getHttpServer())
        .post(`/exercises/${exerciseId}/media`)
        .set('Cookie', cookieA)
        .send({ kind: 'VIDEO', key: presigned.key })
        .expect(400);

      expect(await harness.prisma.exerciseMedia.count()).toBe(0);
      expect(harness.storage.deletedKeys).toContain(presigned.key);
      expect(harness.storage.objects.has(presigned.key)).toBe(false);
    });

    it("refuses a key that belongs to another exercise's prefix", async () => {
      const mine = await createExercise(cookieA, 'Моя');
      const alsoMine = await createExercise(cookieA, 'Теж моя');
      const presigned = (await presign(cookieA, alsoMine).expect(200)).body as PresignMediaResponse;

      harness.storage.putObject(presigned.key, 'video/mp4', MAGIC_FIXTURES.mp4, 1024);

      // Правильна вправа-власниця ключа прийняла б його; інша — ні.
      await request(harness.app.getHttpServer())
        .post(`/exercises/${mine}/media`)
        .set('Cookie', cookieA)
        .send({ kind: 'VIDEO', key: presigned.key })
        .expect(400);

      expect(await harness.prisma.exerciseMedia.count()).toBe(0);
    });

    it('replacing a rendition retires the superseded object and keeps one row', async () => {
      const exerciseId = await createExercise(cookieA);
      const firstKey = await uploadVideo(cookieA, exerciseId);
      const secondKey = await uploadVideo(cookieA, exerciseId);

      expect(firstKey).not.toBe(secondKey);
      expect(harness.storage.deletedKeys).toContain(firstKey);
      expect(await harness.prisma.exerciseMedia.count({ where: { exerciseId } })).toBe(1);

      const record = await harness.prisma.exerciseMedia.findFirstOrThrow({
        where: { exerciseId },
      });
      expect(record.storageKey).toBe(secondKey);
    });
  });

  describe('media-url', () => {
    it('serves the owner a short-lived URL and never the key', async () => {
      const exerciseId = await createExercise(cookieA);
      await uploadVideo(cookieA, exerciseId);

      const response = await request(harness.app.getHttpServer())
        .get(`/exercises/${exerciseId}/media-url?kind=VIDEO`)
        .set('Cookie', cookieA)
        .expect(200);

      const body = response.body as { url: string; expiresAt: string };
      expect(Object.keys(body).sort()).toEqual(['expiresAt', 'url']);
      expect(body.url).toContain('storage.test/get/');

      const msUntilExpiry = new Date(body.expiresAt).getTime() - Date.now();
      expect(msUntilExpiry).toBeGreaterThan((PRESIGNED_GET_TTL_SECONDS - 60) * 1000);
      expect(msUntilExpiry).toBeLessThanOrEqual(PRESIGNED_GET_TTL_SECONDS * 1000);
    });

    it("serves the owner's client, and turns everyone else away as 404", async () => {
      const exerciseId = await createExercise(cookieA);
      await uploadVideo(cookieA, exerciseId);

      const ownClient = await createAcceptedClient(harness, cookieA);
      const foreignClient = await createAcceptedClient(harness, cookieB, {
        fullName: 'Чужий Клієнт',
        email: 'foreign-client@example.com',
      });

      await request(harness.app.getHttpServer())
        .get(`/exercises/${exerciseId}/media-url?kind=VIDEO`)
        .set('Cookie', ownClient.clientCookie)
        .expect(200);

      const foreignTrainer = await request(harness.app.getHttpServer())
        .get(`/exercises/${exerciseId}/media-url?kind=VIDEO`)
        .set('Cookie', cookieB)
        .expect(404);
      const foreignClientResponse = await request(harness.app.getHttpServer())
        .get(`/exercises/${exerciseId}/media-url?kind=VIDEO`)
        .set('Cookie', foreignClient.clientCookie)
        .expect(404);
      const missing = await request(harness.app.getHttpServer())
        .get(`/exercises/${NONEXISTENT_ID}/media-url?kind=VIDEO`)
        .set('Cookie', cookieB)
        .expect(404);

      expect(foreignTrainer.body).toEqual(missing.body);
      expect(foreignClientResponse.body).toEqual(missing.body);
    });

    it('serves global-exercise media to any trainer and any client', async () => {
      const globalRow = await harness.prisma.exercise.create({
        data: { name: 'Глобальна', primaryMuscleGroup: 'CHEST', muscleGroups: [] },
      });
      const key = `exercises/${globalRow.id}/video/seeded.mp4`;
      harness.storage.putObject(key, 'video/mp4', MAGIC_FIXTURES.mp4, 2048);
      await harness.prisma.exerciseMedia.create({
        data: {
          exerciseId: globalRow.id,
          kind: 'VIDEO',
          storageKey: key,
          contentType: 'video/mp4',
          sizeBytes: 2048,
        },
      });

      const { clientCookie } = await createAcceptedClient(harness, cookieB);

      for (const cookie of [cookieA, cookieB, clientCookie]) {
        await request(harness.app.getHttpServer())
          .get(`/exercises/${globalRow.id}/media-url?kind=VIDEO`)
          .set('Cookie', cookie)
          .expect(200);
      }
    });

    it('404s when the exercise has no media of that kind, and 401s with no session', async () => {
      const exerciseId = await createExercise(cookieA);

      await request(harness.app.getHttpServer())
        .get(`/exercises/${exerciseId}/media-url?kind=VIDEO`)
        .set('Cookie', cookieA)
        .expect(404);
      await request(harness.app.getHttpServer())
        .get(`/exercises/${exerciseId}/media-url?kind=VIDEO`)
        .expect(401);
    });
  });

  describe('delete', () => {
    it('removes the record and the object for an own exercise', async () => {
      const exerciseId = await createExercise(cookieA);
      const key = await uploadVideo(cookieA, exerciseId);

      await request(harness.app.getHttpServer())
        .delete(`/exercises/${exerciseId}/media?kind=VIDEO`)
        .set('Cookie', cookieA)
        .expect(204);

      expect(await harness.prisma.exerciseMedia.count()).toBe(0);
      expect(harness.storage.deletedKeys).toContain(key);
    });

    it('refuses foreign exercises and absent media alike', async () => {
      const foreign = await createExercise(cookieB, 'Чужа вправа');
      await uploadVideo(cookieB, foreign);
      const mineWithoutMedia = await createExercise(cookieA, 'Без медіа');

      await request(harness.app.getHttpServer())
        .delete(`/exercises/${foreign}/media?kind=VIDEO`)
        .set('Cookie', cookieA)
        .expect(404);
      await request(harness.app.getHttpServer())
        .delete(`/exercises/${mineWithoutMedia}/media?kind=VIDEO`)
        .set('Cookie', cookieA)
        .expect(404);

      expect(await harness.prisma.exerciseMedia.count()).toBe(1);
    });
  });
});
