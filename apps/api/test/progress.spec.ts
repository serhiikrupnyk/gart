import request from 'supertest';

import type {
  ClientProgress,
  ExerciseLoadHistory,
  LoggedExerciseSummary,
  PresignMediaResponse,
  ProgressPhotoInfo,
  ProgressPoint,
  PublicAssignmentDetail,
  PublicProgramDetail,
  PublicProgressVariable,
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

function isoDate(offsetDays: number): string {
  const now = new Date();
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return new Date(utcToday + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe('progress', () => {
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

  async function createVariable(
    body: Record<string, unknown> = { name: 'Вага', unit: 'кг' },
    cookie = cookieA,
    target = clientId,
  ): Promise<PublicProgressVariable> {
    return (
      await request(server())
        .post(`/clients/${target}/progress/variables`)
        .set('Cookie', cookie)
        .send(body)
        .expect(201)
    ).body as PublicProgressVariable;
  }

  function putEntry(
    variableId: string,
    date: string,
    body: Record<string, unknown>,
    cookie = cookieA,
  ) {
    return request(server())
      .put(`/progress/variables/${variableId}/entries/${date}`)
      .set('Cookie', cookie)
      .send(body);
  }

  async function progress(
    query = '',
    cookie = cookieA,
    target = clientId,
  ): Promise<ClientProgress> {
    return (
      await request(server())
        .get(`/clients/${target}/progress${query}`)
        .set('Cookie', cookie)
        .expect(200)
    ).body as ClientProgress;
  }

  describe('variables', () => {
    it('creates, lists, updates and deletes a tracked dimension', async () => {
      const created = await createVariable({ name: 'Вага', unit: 'кг', selfLog: true });

      expect(created).toMatchObject({ name: 'Вага', unit: 'кг', selfLog: true });

      const listed = (
        await request(server())
          .get(`/clients/${clientId}/progress/variables`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body as PublicProgressVariable[];
      expect(listed).toHaveLength(1);

      const updated = (
        await request(server())
          .patch(`/progress/variables/${created.id}`)
          .set('Cookie', cookieA)
          .send({ name: 'Вага зранку', selfLog: false })
          .expect(200)
      ).body as PublicProgressVariable;
      expect(updated).toMatchObject({ name: 'Вага зранку', unit: 'кг', selfLog: false });

      await request(server())
        .delete(`/progress/variables/${created.id}`)
        .set('Cookie', cookieA)
        .expect(204);

      expect(await harness.prisma.progressVariable.count()).toBe(0);
    });

    it('refuses a duplicate name for the same client, and allows it for another', async () => {
      await createVariable();

      await request(server())
        .post(`/clients/${clientId}/progress/variables`)
        .set('Cookie', cookieA)
        .send({ name: 'Вага', unit: 'кг' })
        .expect(409);

      const sibling = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });
      await createVariable({ name: 'Вага', unit: 'кг' }, cookieA, sibling.clientId);

      expect(await harness.prisma.progressVariable.count()).toBe(2);
    });

    it('takes the measurements with the variable', async () => {
      const variable = await createVariable();
      await putEntry(variable.id, isoDate(-1), { value: 82.5 }).expect(200);

      await request(server())
        .delete(`/progress/variables/${variable.id}`)
        .set('Cookie', cookieA)
        .expect(204);

      expect(await harness.prisma.progressEntry.count()).toBe(0);
    });

    it('validates names, units and values', async () => {
      const variable = await createVariable();

      for (const body of [
        { name: '', unit: 'кг' },
        { name: 'Вага', unit: '' },
        { name: 'я'.repeat(61), unit: 'кг' },
        { name: 'Вага', unit: 'x'.repeat(17) },
      ]) {
        await request(server())
          .post(`/clients/${clientId}/progress/variables`)
          .set('Cookie', cookieA)
          .send(body)
          .expect(400);
      }

      for (const body of [{ value: 82.555 }, { value: 100000 }, { value: 'важкий' }, {}]) {
        await putEntry(variable.id, isoDate(-1), body).expect(400);
      }

      await putEntry(variable.id, '2026-02-31', { value: 80 }).expect(400);
      await putEntry(variable.id, '01.08.2026', { value: 80 }).expect(400);
    });
  });

  describe('entries', () => {
    it('upserts on (variable, date) and keeps two decimal places exactly', async () => {
      const variable = await createVariable();

      const first = await putEntry(variable.id, isoDate(-2), { value: 84.35 }).expect(200);
      expect((first.body as ProgressPoint).value).toBe(84.35);

      const corrected = await putEntry(variable.id, isoDate(-2), {
        value: 84.4,
        notes: 'зранку натще',
      }).expect(200);

      expect(corrected.body).toMatchObject({ value: 84.4, notes: 'зранку натще' });
      expect(await harness.prisma.progressEntry.count()).toBe(1);

      // The column, not the JSON, is what preserved it.
      const row = await harness.prisma.progressEntry.findFirstOrThrow();
      expect(row.value.toString()).toBe('84.4');
    });

    it('returns the series in date order, clipped to the range', async () => {
      const variable = await createVariable();

      for (const [offset, value] of [
        [-30, 86.1],
        [-20, 85.2],
        [-10, 84.3],
        [-1, 83.4],
      ] as const) {
        await putEntry(variable.id, isoDate(offset), { value }).expect(200);
      }

      const all = await progress();
      expect(all.variables[0]?.points.map((point) => point.value)).toEqual([
        86.1, 85.2, 84.3, 83.4,
      ]);

      const narrow = await progress(`?from=${isoDate(-15)}&to=${isoDate(-1)}`);
      expect(narrow.variables[0]?.points.map((point) => point.value)).toEqual([84.3, 83.4]);
    });

    it('deletes a single measurement, and 404s when there is none', async () => {
      const variable = await createVariable();
      await putEntry(variable.id, isoDate(-1), { value: 82 }).expect(200);

      await request(server())
        .delete(`/progress/variables/${variable.id}/entries/${isoDate(-1)}`)
        .set('Cookie', cookieA)
        .expect(204);
      await request(server())
        .delete(`/progress/variables/${variable.id}/entries/${isoDate(-1)}`)
        .set('Cookie', cookieA)
        .expect(404);
    });

    it('rejects an inverted or oversized range', async () => {
      await request(server())
        .get(`/clients/${clientId}/progress?from=${isoDate(-1)}&to=${isoDate(-5)}`)
        .set('Cookie', cookieA)
        .expect(400);
      await request(server())
        .get(`/clients/${clientId}/progress?from=2020-01-01&to=${isoDate(0)}`)
        .set('Cookie', cookieA)
        .expect(400);
    });
  });

  describe('tenancy', () => {
    it("answers for another trainer's client exactly like a nonexistent one", async () => {
      const foreign = await request(server())
        .get(`/clients/${clientId}/progress`)
        .set('Cookie', cookieB)
        .expect(404);
      const missing = await request(server())
        .get(`/clients/${NONEXISTENT_ID}/progress`)
        .set('Cookie', cookieB)
        .expect(404);

      expect(foreign.body).toEqual(missing.body);
    });

    it('refuses a foreign variable on read, write and delete, identically', async () => {
      const variable = await createVariable();

      const patched = await request(server())
        .patch(`/progress/variables/${variable.id}`)
        .set('Cookie', cookieB)
        .send({ name: 'Викрадено' })
        .expect(404);
      const missing = await request(server())
        .patch(`/progress/variables/${NONEXISTENT_ID}`)
        .set('Cookie', cookieB)
        .send({ name: 'Викрадено' })
        .expect(404);
      expect(patched.body).toEqual(missing.body);

      await putEntry(variable.id, isoDate(-1), { value: 60 }, cookieB).expect(404);
      await request(server())
        .delete(`/progress/variables/${variable.id}`)
        .set('Cookie', cookieB)
        .expect(404);

      expect(await harness.prisma.progressVariable.count()).toBe(1);
      expect(await harness.prisma.progressEntry.count()).toBe(0);
    });

    it('turns a client session away from the trainer routes', async () => {
      const asClient = await request(server())
        .get(`/clients/${clientId}/progress`)
        .set('Cookie', clientCookie)
        .expect(401);
      const anonymous = await request(server()).get(`/clients/${clientId}/progress`).expect(401);

      expect(asClient.body).toEqual(anonymous.body);
    });
  });

  describe('the client view', () => {
    it('shows a client their own progress and nobody else', async () => {
      const variable = await createVariable({ name: 'Вага', unit: 'кг', selfLog: true });
      await putEntry(variable.id, isoDate(-1), { value: 83.2 }).expect(200);

      const mine = (
        await request(server()).get('/me/progress').set('Cookie', clientCookie).expect(200)
      ).body as ClientProgress;

      expect(mine.variables).toHaveLength(1);
      expect(mine.variables[0]?.points[0]?.value).toBe(83.2);

      const foreign = await createAcceptedClient(harness, cookieB, {
        fullName: 'Чужий Клієнт',
        email: 'foreign-client@example.com',
      });
      const theirs = (
        await request(server()).get('/me/progress').set('Cookie', foreign.clientCookie).expect(200)
      ).body as ClientProgress;
      expect(theirs.variables).toEqual([]);
    });

    it('lets the client record only what the trainer opened up', async () => {
      const open = await createVariable({ name: 'Вага', unit: 'кг', selfLog: true });
      const closed = await createVariable({ name: '% жиру', unit: '%' });

      const saved = await request(server())
        .put(`/me/progress/variables/${open.id}/entries/${isoDate(0)}`)
        .set('Cookie', clientCookie)
        .send({ value: 83.1 })
        .expect(200);
      expect((saved.body as ProgressPoint).value).toBe(83.1);

      // A closed variable answers exactly like one that does not exist.
      const refused = await request(server())
        .put(`/me/progress/variables/${closed.id}/entries/${isoDate(0)}`)
        .set('Cookie', clientCookie)
        .send({ value: 12 })
        .expect(404);
      const missing = await request(server())
        .put(`/me/progress/variables/${NONEXISTENT_ID}/entries/${isoDate(0)}`)
        .set('Cookie', clientCookie)
        .send({ value: 12 })
        .expect(404);
      expect(refused.body).toEqual(missing.body);

      expect(await harness.prisma.progressEntry.count()).toBe(1);
    });

    it("refuses another client's open variable", async () => {
      const open = await createVariable({ name: 'Вага', unit: 'кг', selfLog: true });

      const sibling = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });

      await request(server())
        .put(`/me/progress/variables/${open.id}/entries/${isoDate(0)}`)
        .set('Cookie', sibling.clientCookie)
        .send({ value: 70 })
        .expect(404);
      expect(await harness.prisma.progressEntry.count()).toBe(0);
    });

    it('applies the same value bounds to a self-logged measurement', async () => {
      const open = await createVariable({ name: 'Вага', unit: 'кг', selfLog: true });

      await request(server())
        .put(`/me/progress/variables/${open.id}/entries/${isoDate(0)}`)
        .set('Cookie', clientCookie)
        .send({ value: 82.555 })
        .expect(400);
    });

    it('cuts an archived client at the guard', async () => {
      await harness.prisma.client.update({
        where: { id: clientId },
        data: { status: 'ARCHIVED' },
      });

      await request(server()).get('/me/progress').set('Cookie', clientCookie).expect(401);
    });
  });

  describe('photos', () => {
    function presign(
      body: Record<string, unknown> = { contentType: 'image/jpeg', sizeBytes: 2048 },
      cookie = cookieA,
      target = clientId,
    ) {
      return request(server())
        .post(`/clients/${target}/progress/photos/presign`)
        .set('Cookie', cookie)
        .send(body);
    }

    /** The whole Step 8 flow: presign, direct PUT, finalize. */
    async function uploadPhoto(
      label = 'Спереду',
      magic: Buffer = MAGIC_FIXTURES.jpeg,
      contentType = 'image/jpeg',
    ): Promise<{ photo: ProgressPhotoInfo; key: string }> {
      const { key } = (await presign().expect(201)).body as PresignMediaResponse;

      harness.storage.putObject(key, contentType, magic, 2048);

      const photo = (
        await request(server())
          .post(`/clients/${clientId}/progress/photos`)
          .set('Cookie', cookieA)
          .send({ key, date: isoDate(-1), label })
          .expect(201)
      ).body as ProgressPhotoInfo;

      return { photo, key };
    }

    it('stores an image and lists it without ever naming the object', async () => {
      const { photo, key } = await uploadPhoto();

      expect(photo).toMatchObject({
        date: isoDate(-1),
        label: 'Спереду',
        contentType: 'image/jpeg',
        sizeBytes: 2048,
      });
      expect(JSON.stringify(photo)).not.toContain(key);

      const listed = await progress();
      expect(listed.photos).toHaveLength(1);
      expect(JSON.stringify(listed.photos)).not.toContain('clients/');
    });

    it('accepts only image types, within the size cap', async () => {
      await presign({ contentType: 'video/mp4', sizeBytes: 2048 }).expect(400);
      await presign({ contentType: 'application/pdf', sizeBytes: 2048 }).expect(400);
      await presign({ contentType: 'image/png', sizeBytes: 11 * 1024 * 1024 }).expect(400);
      await presign({ contentType: 'image/png', sizeBytes: 2048 }).expect(201);
      await presign({ contentType: 'image/webp', sizeBytes: 2048 }).expect(201);
    });

    it('verifies what actually landed, and cleans up when it does not check out', async () => {
      // A key outside this client's prefix.
      await request(server())
        .post(`/clients/${clientId}/progress/photos`)
        .set('Cookie', cookieA)
        .send({ key: 'clients/somebody-else/progress/x.jpg', date: isoDate(-1) })
        .expect(400);

      // Nothing was ever uploaded.
      const { key: missingKey } = (await presign().expect(201)).body as PresignMediaResponse;
      await request(server())
        .post(`/clients/${clientId}/progress/photos`)
        .set('Cookie', cookieA)
        .send({ key: missingKey, date: isoDate(-1) })
        .expect(400);

      // A JPEG declaration over bytes that are not an image at all.
      const { key: liarKey } = (await presign().expect(201)).body as PresignMediaResponse;
      harness.storage.putObject(liarKey, 'image/jpeg', MAGIC_FIXTURES.garbage, 2048);
      await request(server())
        .post(`/clients/${clientId}/progress/photos`)
        .set('Cookie', cookieA)
        .send({ key: liarKey, date: isoDate(-1) })
        .expect(400);

      // The rejected object is not left behind to be paid for.
      expect(harness.storage.deletedKeys).toContain(liarKey);
      expect(await harness.prisma.progressPhoto.count()).toBe(0);
    });

    it('serves a short-lived URL to the owning trainer and that client only', async () => {
      const { photo } = await uploadPhoto();

      const asTrainer = await request(server())
        .get(`/progress/photos/${photo.id}/url`)
        .set('Cookie', cookieA)
        .expect(200);
      expect((asTrainer.body as { url: string }).url).toContain('storage.test/get/');

      await request(server())
        .get(`/progress/photos/${photo.id}/url`)
        .set('Cookie', clientCookie)
        .expect(200);

      const foreignTrainer = await request(server())
        .get(`/progress/photos/${photo.id}/url`)
        .set('Cookie', cookieB)
        .expect(404);
      const missing = await request(server())
        .get(`/progress/photos/${NONEXISTENT_ID}/url`)
        .set('Cookie', cookieB)
        .expect(404);
      expect(foreignTrainer.body).toEqual(missing.body);

      await request(server()).get(`/progress/photos/${photo.id}/url`).expect(401);
    });

    it("refuses a sibling client the same trainer's other client's photo", async () => {
      const { photo } = await uploadPhoto();

      const sibling = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });

      const refused = await request(server())
        .get(`/progress/photos/${photo.id}/url`)
        .set('Cookie', sibling.clientCookie)
        .expect(404);
      const missing = await request(server())
        .get(`/progress/photos/${NONEXISTENT_ID}/url`)
        .set('Cookie', sibling.clientCookie)
        .expect(404);

      expect(refused.body).toEqual(missing.body);
    });

    it('removes the record and the object', async () => {
      const { photo, key } = await uploadPhoto();

      await request(server())
        .delete(`/progress/photos/${photo.id}`)
        .set('Cookie', cookieB)
        .expect(404);
      await request(server())
        .delete(`/progress/photos/${photo.id}`)
        .set('Cookie', cookieA)
        .expect(204);

      expect(harness.storage.deletedKeys).toContain(key);
      expect(await harness.prisma.progressPhoto.count()).toBe(0);
    });
  });

  describe('per-exercise load history', () => {
    let squatId: string;
    let squatLineId: string;

    beforeEach(async () => {
      squatId = (
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
              sections: [
                {
                  type: 'STRENGTH',
                  exercises: [
                    { exerciseId: squatId, sets: 3, reps: 5, loadValue: 80, loadUnit: 'KG' },
                  ],
                },
              ],
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
      ).body as PublicAssignmentDetail;

      squatLineId = assignment.sections[0]!.exercises[0]!.id;
    });

    function log(date: string, sets: Record<string, unknown>[], completed = true) {
      return request(server())
        .put(`/me/assignment-exercises/${squatLineId}/logs/${date}`)
        .set('Cookie', clientCookie)
        .send({ completed, sets })
        .expect(200);
    }

    async function history(exerciseId = squatId): Promise<ExerciseLoadHistory> {
      return (
        await request(server())
          .get(`/clients/${clientId}/progress/exercises/${exerciseId}`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body as ExerciseLoadHistory;
    }

    it('derives top set, volume and estimated 1RM from the logs', async () => {
      await log(isoDate(-7), [
        { reps: 5, loadKg: 80 },
        { reps: 5, loadKg: 80 },
        { reps: 3, loadKg: 90 },
      ]);

      const result = await history();

      expect(result.exercise).toMatchObject({ id: squatId, name: 'Присідання', sessions: 1 });
      expect(result.points).toHaveLength(1);
      expect(result.points[0]).toEqual({
        date: isoDate(-7),
        topSetKg: 90,
        // 5×80 + 5×80 + 3×90 = 1070
        volumeKg: 1070,
        // Epley: max(80 × (1 + 5/30) = 93.33, 90 × (1 + 3/30) = 99)
        estimatedOneRepMaxKg: 99,
      });
    });

    it('leaves the estimate out where the formula stops meaning anything', async () => {
      await log(isoDate(-5), [{ reps: 20, loadKg: 60 }]);

      const [point] = (await history()).points;

      expect(point?.topSetKg).toBe(60);
      expect(point?.volumeKg).toBe(1200);
      expect(point?.estimatedOneRepMaxKg).toBeNull();
    });

    it('orders points by date and counts sessions', async () => {
      await log(isoDate(-9), [{ reps: 5, loadKg: 75 }]);
      await log(isoDate(-2), [{ reps: 5, loadKg: 85 }]);

      const result = await history();

      expect(result.points.map((point) => point.date)).toEqual([isoDate(-9), isoDate(-2)]);
      expect(result.points.map((point) => point.topSetKg)).toEqual([75, 85]);
      expect(result.exercise.sessions).toBe(2);
      expect(result.exercise.lastDate).toBe(isoDate(-2));
    });

    it('ignores a skipped session', async () => {
      await log(isoDate(-3), [], false);

      await request(server())
        .get(`/clients/${clientId}/progress/exercises/${squatId}`)
        .set('Cookie', cookieA)
        .expect(404);
    });

    it('lists only the exercises this client has recorded', async () => {
      await log(isoDate(-4), [{ reps: 5, loadKg: 80 }]);

      const listed = (
        await request(server())
          .get(`/clients/${clientId}/progress/exercises`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body as LoggedExerciseSummary[];

      expect(listed).toEqual([
        { id: squatId, name: 'Присідання', sessions: 1, lastDate: isoDate(-4) },
      ]);
    });

    it('keeps another trainer out of the derivation', async () => {
      await log(isoDate(-4), [{ reps: 5, loadKg: 80 }]);

      const foreign = await request(server())
        .get(`/clients/${clientId}/progress/exercises/${squatId}`)
        .set('Cookie', cookieB)
        .expect(404);
      const missing = await request(server())
        .get(`/clients/${NONEXISTENT_ID}/progress/exercises/${squatId}`)
        .set('Cookie', cookieB)
        .expect(404);

      expect(foreign.body).toEqual(missing.body);
    });
  });
});
