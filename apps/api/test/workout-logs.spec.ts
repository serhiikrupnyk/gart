import request from 'supertest';

import type {
  ClientWorkoutDay,
  ClientWorkoutLog,
  PublicAssignmentDetail,
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

const NONEXISTENT_ID = 'cl00000000000000000000000';

/**
 * The log window is measured against the real clock — the one place the server
 * consults it — so fixtures are relative to today rather than pinned to a
 * calendar date that would expire. Everything is computed in UTC, matching the
 * @db.Date columns and the window arithmetic.
 */
function isoDate(offsetDays: number): string {
  const now = new Date();
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return new Date(utcToday + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isoWeekdayOf(offsetDays: number): number {
  const weekday = new Date(`${isoDate(offsetDays)}T00:00:00.000Z`).getUTCDay();

  return weekday === 0 ? 7 : weekday;
}

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];
const TODAY = isoDate(0);

describe('workout logs (/me/assignment-exercises/:id/logs/:date)', () => {
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

    squatId = (
      await harness.prisma.exercise.create({
        data: { name: 'Присідання', primaryMuscleGroup: 'LEGS', muscleGroups: [] },
      })
    ).id;
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
            type: 'STRENGTH',
            sections: [
              {
                name: 'Основна частина',
                type: 'STRENGTH',
                exercises: [
                  { exerciseId: squatId, sets: 5, reps: 5, loadValue: 82.5, loadUnit: 'KG' },
                  { exerciseId: plankId, durationSeconds: 40 },
                ],
              },
            ],
          })
          .expect(201)
      ).body as PublicProgramDetail
    ).id;
  });

  /** Scheduled every weekday from a month back, so any date is a training day. */
  async function assign(
    schedule: Record<string, unknown> = { startDate: isoDate(-30), daysOfWeek: EVERY_DAY },
    cookie = cookieA,
    targetClientId = clientId,
  ): Promise<PublicAssignmentDetail> {
    return (
      await request(harness.app.getHttpServer())
        .post(`/clients/${targetClientId}/assignments`)
        .set('Cookie', cookie)
        .send({ programId, ...schedule })
        .expect(201)
    ).body as PublicAssignmentDetail;
  }

  /** The durable snapshot ids the logs address. */
  function lineIds(assignment: PublicAssignmentDetail): { squat: string; plank: string } {
    const [squat, plank] = assignment.sections[0]!.exercises;

    return { squat: squat!.id, plank: plank!.id };
  }

  function putLog(
    exerciseId: string,
    date: string,
    body: Record<string, unknown>,
    cookie = clientCookie,
  ) {
    return request(harness.app.getHttpServer())
      .put(`/me/assignment-exercises/${exerciseId}/logs/${date}`)
      .set('Cookie', cookie)
      .send(body);
  }

  async function workoutsOn(date: string, cookie = clientCookie): Promise<ClientWorkoutDay> {
    return (
      await request(harness.app.getHttpServer())
        .get(`/me/workouts?date=${date}`)
        .set('Cookie', cookie)
        .expect(200)
    ).body as ClientWorkoutDay;
  }

  const DONE_AS_PRESCRIBED = {
    completed: true,
    sets: Array.from({ length: 5 }, () => ({ reps: 5, loadKg: 82.5 })),
  };

  describe('recording', () => {
    it('records actual sets and returns them', async () => {
      const { squat } = lineIds(await assign());

      const response = await putLog(squat, TODAY, {
        completed: true,
        notes: 'важко на останньому',
        sets: [
          { reps: 5, loadKg: 82.5 },
          { reps: 5, loadKg: 82.5 },
          { reps: 3, loadKg: 82.5 },
        ],
      }).expect(200);

      const log = response.body as ClientWorkoutLog;
      expect(log.completed).toBe(true);
      expect(log.notes).toBe('важко на останньому');
      expect(log.sets).toEqual([
        { reps: 5, loadKg: 82.5, durationSeconds: null, distanceMeters: null },
        { reps: 5, loadKg: 82.5, durationSeconds: null, distanceMeters: null },
        { reps: 3, loadKg: 82.5, durationSeconds: null, distanceMeters: null },
      ]);
    });

    it('attaches the log to the SNAPSHOT exercise, not the template or the library', async () => {
      const assignment = await assign();
      const { squat } = lineIds(assignment);

      await putLog(squat, TODAY, DONE_AS_PRESCRIBED).expect(200);

      const row = await harness.prisma.workoutLog.findFirstOrThrow({
        where: { date: new Date(`${TODAY}T00:00:00.000Z`) },
      });

      expect(row.assignmentExerciseId).toBe(squat);
      expect(row.clientId).toBe(clientId);

      // The id is a snapshot row, and it is neither the library exercise nor
      // the template line it was copied from.
      const snapshot = await harness.prisma.assignmentExercise.findUniqueOrThrow({
        where: { id: row.assignmentExerciseId },
        include: { section: true },
      });
      expect(snapshot.section.assignmentId).toBe(assignment.id);
      expect(row.assignmentExerciseId).not.toBe(squatId);

      const templateIds = (
        await harness.prisma.programExercise.findMany({ select: { id: true } })
      ).map((line) => line.id);
      expect(templateIds).not.toContain(row.assignmentExerciseId);
    });

    it('never mutates the frozen prescription', async () => {
      const assignment = await assign();
      const { squat } = lineIds(assignment);
      const before = await harness.prisma.assignmentExercise.findUniqueOrThrow({
        where: { id: squat },
      });

      await putLog(squat, TODAY, {
        completed: true,
        sets: [
          { reps: 3, loadKg: 60 },
          { reps: 3, loadKg: 60 },
        ],
      }).expect(200);

      const after = await harness.prisma.assignmentExercise.findUniqueOrThrow({
        where: { id: squat },
      });
      expect(after).toEqual(before);

      // And the trainer's view of the prescription is unchanged too.
      const detail = (
        await request(harness.app.getHttpServer())
          .get(`/assignments/${assignment.id}`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body as PublicAssignmentDetail;
      expect(detail.sections[0]!.exercises[0]).toMatchObject({
        sets: 5,
        reps: 5,
        loadValue: 82.5,
        loadUnit: 'KG',
      });
    });

    it('upserts: a second write updates the same row and replaces the sets', async () => {
      const { squat } = lineIds(await assign());

      await putLog(squat, TODAY, DONE_AS_PRESCRIBED).expect(200);
      const second = await putLog(squat, TODAY, {
        completed: true,
        sets: [
          { reps: 8, loadKg: 70 },
          { reps: 8, loadKg: 70 },
        ],
      }).expect(200);

      expect((second.body as ClientWorkoutLog).sets).toHaveLength(2);
      expect(await harness.prisma.workoutLog.count()).toBe(1);
      expect(await harness.prisma.workoutSetLog.count()).toBe(2);
    });

    it('records a deliberate skip, which is not the same as no record', async () => {
      const { squat, plank } = lineIds(await assign());

      await putLog(squat, TODAY, {
        completed: false,
        notes: 'біль у коліні',
        sets: [],
      }).expect(200);

      const day = await workoutsOn(TODAY);
      const [squatLine, plankLine] = day.workouts[0]!.sections[0]!.exercises;

      expect(squatLine!.id).toBe(squat);
      expect(squatLine!.log).toMatchObject({ completed: false, notes: 'біль у коліні', sets: [] });
      expect(plankLine!.id).toBe(plank);
      expect(plankLine!.log).toBeNull();
    });

    it('keeps logs independent across exercises and dates', async () => {
      const { squat, plank } = lineIds(await assign());
      const yesterday = isoDate(-1);

      await putLog(squat, TODAY, DONE_AS_PRESCRIBED).expect(200);
      await putLog(plank, TODAY, { completed: true, sets: [{ durationSeconds: 45 }] }).expect(200);
      await putLog(squat, yesterday, { completed: true, sets: [{ reps: 5, loadKg: 80 }] }).expect(
        200,
      );

      expect(await harness.prisma.workoutLog.count()).toBe(3);

      const today = await workoutsOn(TODAY);
      const lines = today.workouts[0]!.sections[0]!.exercises;
      expect(lines[0]!.log?.sets).toHaveLength(5);
      expect(lines[1]!.log?.sets).toEqual([
        { reps: null, loadKg: null, durationSeconds: 45, distanceMeters: null },
      ]);

      const before = await workoutsOn(yesterday);
      expect(before.workouts[0]!.sections[0]!.exercises[0]!.log?.sets).toEqual([
        { reps: 5, loadKg: 80, durationSeconds: null, distanceMeters: null },
      ]);
    });
  });

  describe('GET /me/workouts merges the log', () => {
    it('carries prescription, live exercise and the record together', async () => {
      const { squat } = lineIds(await assign());

      await putLog(squat, TODAY, DONE_AS_PRESCRIBED).expect(200);

      const line = (await workoutsOn(TODAY)).workouts[0]!.sections[0]!.exercises[0]!;

      expect(line.sets).toBe(5);
      expect(line.loadValue).toBe(82.5);
      expect(line.exercise.name).toBe('Присідання');
      expect(line.log?.completed).toBe(true);
      expect(line.log?.sets).toHaveLength(5);
    });

    it('reads null before anything is recorded, and on a plan read', async () => {
      const assignment = await assign();

      expect((await workoutsOn(TODAY)).workouts[0]!.sections[0]!.exercises[0]!.log).toBeNull();

      await putLog(lineIds(assignment).squat, TODAY, DONE_AS_PRESCRIBED).expect(200);

      // A plan has no date, so it carries no record.
      const plan = await request(harness.app.getHttpServer())
        .get(`/me/assignments/${assignment.id}`)
        .set('Cookie', clientCookie)
        .expect(200);
      const planLine = (plan.body as PublicAssignmentDetail).sections[0]!.exercises[0]!;
      expect((planLine as unknown as { log: unknown }).log).toBeNull();
    });
  });

  describe('DELETE', () => {
    it('removes the record and its sets, back to nothing logged', async () => {
      const { squat } = lineIds(await assign());
      await putLog(squat, TODAY, DONE_AS_PRESCRIBED).expect(200);

      await request(harness.app.getHttpServer())
        .delete(`/me/assignment-exercises/${squat}/logs/${TODAY}`)
        .set('Cookie', clientCookie)
        .expect(204);

      expect(await harness.prisma.workoutLog.count()).toBe(0);
      expect(await harness.prisma.workoutSetLog.count()).toBe(0);
      expect((await workoutsOn(TODAY)).workouts[0]!.sections[0]!.exercises[0]!.log).toBeNull();
    });

    it('404s when there is nothing to remove', async () => {
      const { squat } = lineIds(await assign());

      await request(harness.app.getHttpServer())
        .delete(`/me/assignment-exercises/${squat}/logs/${TODAY}`)
        .set('Cookie', clientCookie)
        .expect(404);
    });
  });

  describe('the logging window', () => {
    it('accepts a missed day inside the window and refuses one beyond it', async () => {
      const { squat } = lineIds(await assign());

      await putLog(squat, isoDate(-13), DONE_AS_PRESCRIBED).expect(200);

      const tooOld = await putLog(squat, isoDate(-15), DONE_AS_PRESCRIBED).expect(400);
      expect((tooOld.body as { message: string }).message).toContain('14 днів');
    });

    it('tolerates a day ahead of UTC but refuses the future', async () => {
      const { squat } = lineIds(await assign());

      // A device east of UTC may legitimately already be on tomorrow's date.
      await putLog(squat, isoDate(1), DONE_AS_PRESCRIBED).expect(200);

      const future = await putLog(squat, isoDate(2), DONE_AS_PRESCRIBED).expect(400);
      expect((future.body as { message: string }).message).toContain('майбутнє');
    });

    it('refuses a day the assignment is not scheduled for', async () => {
      // Scheduled only on today's weekday, so tomorrow is a rest day.
      const { squat } = lineIds(
        await assign({ startDate: isoDate(-30), daysOfWeek: [isoWeekdayOf(0)] }),
      );

      const response = await putLog(squat, isoDate(1), DONE_AS_PRESCRIBED).expect(400);
      expect((response.body as { message: string }).message).toContain('не заплановане');
      expect(await harness.prisma.workoutLog.count()).toBe(0);
    });

    it('refuses dates outside the assignment window', async () => {
      const { squat } = lineIds(
        await assign({ startDate: isoDate(-2), endDate: isoDate(-1), daysOfWeek: EVERY_DAY }),
      );

      await putLog(squat, isoDate(-3), DONE_AS_PRESCRIBED).expect(400);
      await putLog(squat, TODAY, DONE_AS_PRESCRIBED).expect(400);
      await putLog(squat, isoDate(-1), DONE_AS_PRESCRIBED).expect(200);
    });

    it('refuses new records once the assignment is no longer active, keeping the old ones', async () => {
      const assignment = await assign();
      const { squat, plank } = lineIds(assignment);

      await putLog(squat, TODAY, DONE_AS_PRESCRIBED).expect(200);

      await request(harness.app.getHttpServer())
        .patch(`/assignments/${assignment.id}`)
        .set('Cookie', cookieA)
        .send({ status: 'COMPLETED' })
        .expect(200);

      await putLog(plank, TODAY, { completed: true, sets: [] }).expect(400);
      expect(await harness.prisma.workoutLog.count()).toBe(1);
    });

    it('rejects malformed and impossible dates', async () => {
      const { squat } = lineIds(await assign());

      await putLog(squat, '03.08.2026', DONE_AS_PRESCRIBED).expect(400);
      await putLog(squat, '2026-02-31', DONE_AS_PRESCRIBED).expect(400);
    });
  });

  describe('tenancy', () => {
    it("refuses another client's snapshot exercise exactly like a nonexistent one", async () => {
      const { squat } = lineIds(await assign());

      const foreign = await createAcceptedClient(harness, cookieB, {
        fullName: 'Чужий Клієнт',
        email: 'foreign-client@example.com',
      });

      const stolen = await putLog(squat, TODAY, DONE_AS_PRESCRIBED, foreign.clientCookie).expect(
        404,
      );
      const missing = await putLog(
        NONEXISTENT_ID,
        TODAY,
        DONE_AS_PRESCRIBED,
        foreign.clientCookie,
      ).expect(404);

      expect(stolen.body).toEqual(missing.body);
      expect(await harness.prisma.workoutLog.count()).toBe(0);
    });

    it("refuses a second client of the SAME trainer another client's exercise", async () => {
      const { squat } = lineIds(await assign());

      const sibling = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });

      await putLog(squat, TODAY, DONE_AS_PRESCRIBED, sibling.clientCookie).expect(404);
      expect(await harness.prisma.workoutLog.count()).toBe(0);
    });

    it('cannot be deleted by anyone but its owner', async () => {
      const { squat } = lineIds(await assign());
      await putLog(squat, TODAY, DONE_AS_PRESCRIBED).expect(200);

      const foreign = await createAcceptedClient(harness, cookieB, {
        fullName: 'Чужий Клієнт',
        email: 'foreign-client@example.com',
      });

      await request(harness.app.getHttpServer())
        .delete(`/me/assignment-exercises/${squat}/logs/${TODAY}`)
        .set('Cookie', foreign.clientCookie)
        .expect(404);

      expect(await harness.prisma.workoutLog.count()).toBe(1);
    });

    it('turns trainer sessions away exactly like anonymous ones', async () => {
      const { squat } = lineIds(await assign());

      const asTrainer = await putLog(squat, TODAY, DONE_AS_PRESCRIBED, cookieA).expect(401);
      const anonymous = await request(harness.app.getHttpServer())
        .put(`/me/assignment-exercises/${squat}/logs/${TODAY}`)
        .send(DONE_AS_PRESCRIBED)
        .expect(401);

      expect(asTrainer.body).toEqual(anonymous.body);
    });

    it('cuts an archived client at the guard', async () => {
      const { squat } = lineIds(await assign());
      await harness.prisma.client.update({
        where: { id: clientId },
        data: { status: 'ARCHIVED' },
      });

      await putLog(squat, TODAY, DONE_AS_PRESCRIBED).expect(401);
    });

    it('takes the logs with the assignment when the trainer deletes it', async () => {
      const assignment = await assign();
      const { squat } = lineIds(assignment);
      await putLog(squat, TODAY, DONE_AS_PRESCRIBED).expect(200);

      await request(harness.app.getHttpServer())
        .delete(`/assignments/${assignment.id}`)
        .set('Cookie', cookieA)
        .expect(204);

      expect(await harness.prisma.workoutLog.count()).toBe(0);
      expect(await harness.prisma.workoutSetLog.count()).toBe(0);
      // The library exercise is untouched by any of it.
      expect(await harness.prisma.exercise.count({ where: { id: squatId } })).toBe(1);
    });
  });

  describe('validation', () => {
    it('rejects out-of-range and oversized input', async () => {
      const { squat } = lineIds(await assign());

      const cases: Record<string, unknown>[] = [
        { completed: true, sets: [{ reps: 1001 }] },
        { completed: true, sets: [{ reps: -1 }] },
        { completed: true, sets: [{ loadKg: 82.555 }] },
        { completed: true, sets: [{ loadKg: 1001 }] },
        { completed: true, sets: Array.from({ length: 51 }, () => ({ reps: 1 })) },
        { completed: true, sets: [], notes: 'я'.repeat(501) },
        { completed: 'так', sets: [] },
        { sets: [] },
        { completed: true },
      ];

      for (const body of cases) {
        await putLog(squat, TODAY, body).expect(400);
      }

      expect(await harness.prisma.workoutLog.count()).toBe(0);
    });

    it('accepts the empty-set completion a bodyweight line needs', async () => {
      const { plank } = lineIds(await assign());

      const response = await putLog(plank, TODAY, { completed: true, sets: [] }).expect(200);

      expect((response.body as ClientWorkoutLog).sets).toEqual([]);
      expect((response.body as ClientWorkoutLog).notes).toBeNull();
    });
  });
});
