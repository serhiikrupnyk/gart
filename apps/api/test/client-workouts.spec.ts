import request from 'supertest';

import type {
  ClientAssignment,
  ClientWorkout,
  ClientWorkoutDay,
  PublicAssignmentDetail,
  PublicExercise,
  PublicProgramDetail,
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

// 2026-08-03 is a Monday; the fixture assignment runs Пн+Пт from that day.
const MONDAY = '2026-08-03';
const START = { startDate: MONDAY, daysOfWeek: [1, 5] };

describe('client workouts (/me)', () => {
  let harness: Harness;
  let cookieA: string;
  let cookieB: string;
  let clientCookie: string;
  let clientId: string;
  let programId: string;
  let squatId: string;
  let plankId: string;

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

    // A custom exercise of trainer A, with instructions and seeded media —
    // the live-library half of what the client sees.
    squatId = (
      (
        await request(harness.app.getHttpServer())
          .post('/exercises')
          .set('Cookie', cookieA)
          .send({
            name: 'Присідання',
            primaryMuscleGroup: 'LEGS',
            muscleGroups: [],
            textInstructions: 'Спина рівна, коліна за носками.',
          })
          .expect(201)
      ).body as PublicExercise
    ).id;

    const squatKey = `exercises/${squatId}/video/seeded.mp4`;
    harness.storage.putObject(squatKey, 'video/mp4', MAGIC_FIXTURES.mp4, 2048);
    await harness.prisma.exerciseMedia.create({
      data: {
        exerciseId: squatId,
        kind: 'VIDEO',
        storageKey: squatKey,
        contentType: 'video/mp4',
        sizeBytes: 2048,
      },
    });

    plankId = (
      await harness.prisma.exercise.create({
        data: { name: 'Планка', primaryMuscleGroup: 'CORE', muscleGroups: [] },
      })
    ).id;

    programId = (
      (
        await request(harness.app.getHttpServer())
          .post('/programs')
          .set('Cookie', cookieA)
          .send({
            name: 'Сила: день 1',
            description: 'база',
            type: 'STRENGTH',
            sections: [
              {
                name: 'Основна частина',
                type: 'STRENGTH',
                exercises: [
                  { exerciseId: squatId, sets: 5, reps: 5, loadValue: 82.5, loadUnit: 'KG' },
                ],
              },
              {
                name: 'Фінішер',
                type: 'AMRAP',
                timeCapSeconds: 720,
                exercises: [{ exerciseId: plankId, durationSeconds: 40, loadText: 'до відмови' }],
              },
            ],
          })
          .expect(201)
      ).body as PublicProgramDetail
    ).id;
  });

  async function assign(
    schedule: Record<string, unknown> = START,
  ): Promise<PublicAssignmentDetail> {
    return (
      await request(harness.app.getHttpServer())
        .post(`/clients/${clientId}/assignments`)
        .set('Cookie', cookieA)
        .send({ programId, ...schedule })
        .expect(201)
    ).body as PublicAssignmentDetail;
  }

  async function workoutsOn(date: string, cookie = clientCookie): Promise<ClientWorkoutDay> {
    return (
      await request(harness.app.getHttpServer())
        .get(`/me/workouts?date=${date}`)
        .set('Cookie', cookie)
        .expect(200)
    ).body as ClientWorkoutDay;
  }

  describe('GET /me/workouts', () => {
    it('returns the full workout tree on a scheduled day', async () => {
      await assign();

      const day = await workoutsOn(MONDAY);

      expect(day.date).toBe(MONDAY);
      expect(day.workouts).toHaveLength(1);

      const workout = day.workouts[0]!;
      expect(workout.name).toBe('Сила: день 1');
      expect(workout.type).toBe('STRENGTH');
      expect(workout.sections.map((s) => s.name)).toEqual(['Основна частина', 'Фінішер']);
      expect(workout.sections[1]!.timeCapSeconds).toBe(720);

      const squatLine = workout.sections[0]!.exercises[0]!;
      expect(squatLine.sets).toBe(5);
      expect(squatLine.reps).toBe(5);
      expect(squatLine.loadValue).toBe(82.5);
      expect(squatLine.loadUnit).toBe('KG');
      expect(squatLine.exercise.name).toBe('Присідання');
      expect(squatLine.exercise.textInstructions).toBe('Спина рівна, коліна за носками.');
      expect(squatLine.exercise.media).toEqual([
        expect.objectContaining({ kind: 'VIDEO', contentType: 'video/mp4', sizeBytes: 2048 }),
      ]);

      const plankLine = workout.sections[1]!.exercises[0]!;
      expect(plankLine.durationSeconds).toBe(40);
      expect(plankLine.loadText).toBe('до відмови');
      expect(plankLine.exercise.media).toEqual([]);
    });

    it('matches only scheduled weekdays inside the date window', async () => {
      await assign();

      // Friday before startDate — the weekday matches, the window does not.
      expect((await workoutsOn('2026-07-31')).workouts).toHaveLength(0);
      // Tuesday after start — window matches, weekday does not.
      expect((await workoutsOn('2026-08-04')).workouts).toHaveLength(0);
      // Friday after start — both match.
      expect((await workoutsOn('2026-08-07')).workouts).toHaveLength(1);
    });

    it('runs forever without endDate, and endDate itself is included', async () => {
      const assignment = await assign();

      // 2027-01-04 is a Monday far in the future — no endDate, still on.
      expect((await workoutsOn('2027-01-04')).workouts).toHaveLength(1);

      // End on the following Monday: that day still trains, a week later not.
      await request(harness.app.getHttpServer())
        .patch(`/assignments/${assignment.id}`)
        .set('Cookie', cookieA)
        .send({ endDate: '2026-08-10' })
        .expect(200);

      expect((await workoutsOn('2026-08-10')).workouts).toHaveLength(1);
      expect((await workoutsOn('2026-08-17')).workouts).toHaveLength(0);
    });

    it('shows only ACTIVE assignments', async () => {
      const assignment = await assign();

      for (const [status, expected] of [
        ['COMPLETED', 0],
        ['ACTIVE', 1],
        ['ARCHIVED', 0],
      ] as const) {
        await request(harness.app.getHttpServer())
          .patch(`/assignments/${assignment.id}`)
          .set('Cookie', cookieA)
          .send({ status })
          .expect(200);

        expect((await workoutsOn(MONDAY)).workouts).toHaveLength(expected);
      }
    });

    it('returns every workout scheduled that day, oldest assignment first', async () => {
      const first = await assign();
      const second = await assign();

      // Same-millisecond creations would make the order a coin flip.
      await harness.prisma.assignment.update({
        where: { id: first.id },
        data: { assignedAt: new Date(Date.now() - 60 * 60 * 1000) },
      });

      const day = await workoutsOn(MONDAY);
      expect(day.workouts.map((w) => w.id)).toEqual([first.id, second.id]);
    });

    it('rejects missing, malformed and impossible dates', async () => {
      for (const query of ['', '?date=03.08.2026', '?date=2026-02-31']) {
        await request(harness.app.getHttpServer())
          .get(`/me/workouts${query}`)
          .set('Cookie', clientCookie)
          .expect(400);
      }
    });
  });

  describe('frozen prescription, live library', () => {
    it('a library rename reaches the client; the numbers stay frozen', async () => {
      await assign();

      await harness.prisma.exercise.update({
        where: { id: squatId },
        data: { name: 'Присідання зі штангою' },
      });

      const line = (await workoutsOn(MONDAY)).workouts[0]!.sections[0]!.exercises[0]!;
      expect(line.exercise.name).toBe('Присідання зі штангою');
      expect(line.sets).toBe(5);
      expect(line.loadValue).toBe(82.5);
    });

    it('exercise lines carry the durable snapshot ids', async () => {
      const assignment = await assign();

      const snapshotRows = await harness.prisma.assignmentExercise.findMany({
        where: { section: { assignmentId: assignment.id } },
        orderBy: { order: 'asc' },
      });

      const day = await workoutsOn(MONDAY);
      const lineIds = day.workouts[0]!.sections.flatMap((s) => s.exercises.map((e) => e.id));
      expect(lineIds.sort()).toEqual(snapshotRows.map((row) => row.id).sort());
    });

    it('the payload leaks neither provenance nor storage internals', async () => {
      await assign();

      const response = await request(harness.app.getHttpServer())
        .get(`/me/workouts?date=${MONDAY}`)
        .set('Cookie', clientCookie)
        .expect(200);

      const raw = JSON.stringify(response.body);
      expect(raw).not.toContain('sourceProgramId');
      expect(raw).not.toContain('storageKey');
      expect(raw).not.toContain(`exercises/${squatId}/video`);
    });
  });

  describe('GET /me/assignments', () => {
    it('lists only ACTIVE plans, newest first, with counts', async () => {
      const first = await assign();
      const second = await assign();
      const third = await assign();

      await harness.prisma.assignment.update({
        where: { id: first.id },
        data: { assignedAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
      await request(harness.app.getHttpServer())
        .patch(`/assignments/${third.id}`)
        .set('Cookie', cookieA)
        .send({ status: 'COMPLETED' })
        .expect(200);

      const response = await request(harness.app.getHttpServer())
        .get('/me/assignments')
        .set('Cookie', clientCookie)
        .expect(200);

      const plans = response.body as ClientAssignment[];
      expect(plans.map((p) => p.id)).toEqual([second.id, first.id]);
      expect(plans[0]).toMatchObject({
        name: 'Сила: день 1',
        status: 'ACTIVE',
        startDate: MONDAY,
        endDate: null,
        daysOfWeek: [1, 5],
        sectionCount: 2,
        exerciseCount: 2,
      });
    });

    it('serves the own tree by id; foreign and nonexistent are the same 404', async () => {
      const assignment = await assign();

      const own = await request(harness.app.getHttpServer())
        .get(`/me/assignments/${assignment.id}`)
        .set('Cookie', clientCookie)
        .expect(200);
      expect((own.body as ClientWorkout).sections).toHaveLength(2);

      const foreignClient = await createAcceptedClient(harness, cookieB, {
        fullName: 'Чужий Клієнт',
        email: 'foreign-client@example.com',
      });

      const foreign = await request(harness.app.getHttpServer())
        .get(`/me/assignments/${assignment.id}`)
        .set('Cookie', foreignClient.clientCookie)
        .expect(404);
      const missing = await request(harness.app.getHttpServer())
        .get(`/me/assignments/${NONEXISTENT_ID}`)
        .set('Cookie', foreignClient.clientCookie)
        .expect(404);

      expect(foreign.body).toEqual(missing.body);
    });
  });

  describe('tenancy and guards', () => {
    it('a second client sees nothing of the first', async () => {
      await assign();

      const foreignClient = await createAcceptedClient(harness, cookieB, {
        fullName: 'Чужий Клієнт',
        email: 'foreign-client@example.com',
      });

      expect((await workoutsOn(MONDAY, foreignClient.clientCookie)).workouts).toHaveLength(0);

      const plans = await request(harness.app.getHttpServer())
        .get('/me/assignments')
        .set('Cookie', foreignClient.clientCookie)
        .expect(200);
      expect(plans.body).toEqual([]);
    });

    it('trainer sessions are turned away exactly like anonymous ones', async () => {
      const asTrainer = await request(harness.app.getHttpServer())
        .get(`/me/workouts?date=${MONDAY}`)
        .set('Cookie', cookieA)
        .expect(401);
      const anonymous = await request(harness.app.getHttpServer())
        .get(`/me/workouts?date=${MONDAY}`)
        .expect(401);

      expect(asTrainer.body).toEqual(anonymous.body);

      await request(harness.app.getHttpServer())
        .get('/me/assignments')
        .set('Cookie', cookieA)
        .expect(401);
    });

    it('an archived client is cut at the guard', async () => {
      await assign();
      await harness.prisma.client.update({
        where: { id: clientId },
        data: { status: 'ARCHIVED' },
      });

      await request(harness.app.getHttpServer())
        .get(`/me/workouts?date=${MONDAY}`)
        .set('Cookie', clientCookie)
        .expect(401);
    });
  });

  describe('media access', () => {
    it("an assigned exercise's media plays through the standard media-url endpoint", async () => {
      await assign();

      const response = await request(harness.app.getHttpServer())
        .get(`/exercises/${squatId}/media-url?kind=VIDEO`)
        .set('Cookie', clientCookie)
        .expect(200);

      expect((response.body as { url: string }).url).toContain('storage.test/get/');
    });

    it("a foreign trainer's client gets the same 404 as for a nonexistent exercise", async () => {
      await assign();

      const foreignClient = await createAcceptedClient(harness, cookieB, {
        fullName: 'Чужий Клієнт',
        email: 'foreign-client@example.com',
      });

      const foreign = await request(harness.app.getHttpServer())
        .get(`/exercises/${squatId}/media-url?kind=VIDEO`)
        .set('Cookie', foreignClient.clientCookie)
        .expect(404);
      const missing = await request(harness.app.getHttpServer())
        .get(`/exercises/${NONEXISTENT_ID}/media-url?kind=VIDEO`)
        .set('Cookie', foreignClient.clientCookie)
        .expect(404);

      expect(foreign.body).toEqual(missing.body);
    });
  });
});
