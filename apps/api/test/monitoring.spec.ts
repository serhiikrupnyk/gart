import request from 'supertest';

import type {
  ClientListItem,
  ClientWorkoutHistory,
  PublicAssignmentDetail,
  PublicProgramDetail,
  TrainerWorkoutSession,
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

/** Relative to the real clock, because the log window and «today» are. */
function isoDate(offsetDays: number): string {
  const now = new Date();
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return new Date(utcToday + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];
const YESTERDAY = isoDate(-1);

describe('trainer monitoring', () => {
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

  function lineIds(assignment: PublicAssignmentDetail): { squat: string; plank: string } {
    const [squat, plank] = assignment.sections[0]!.exercises;

    return { squat: squat!.id, plank: plank!.id };
  }

  function log(
    exerciseId: string,
    date: string,
    body: Record<string, unknown>,
    cookie = clientCookie,
  ) {
    return request(harness.app.getHttpServer())
      .put(`/me/assignment-exercises/${exerciseId}/logs/${date}`)
      .set('Cookie', cookie)
      .send(body)
      .expect(200);
  }

  const AS_PRESCRIBED = {
    completed: true,
    sets: Array.from({ length: 5 }, () => ({ reps: 5, loadKg: 82.5 })),
  };
  const PLANK_DONE = { completed: true, sets: [{ durationSeconds: 40 }] };

  async function history(
    query = '',
    cookie = cookieA,
    target = clientId,
  ): Promise<ClientWorkoutHistory> {
    return (
      await request(harness.app.getHttpServer())
        .get(`/clients/${target}/workout-history${query}`)
        .set('Cookie', cookie)
        .expect(200)
    ).body as ClientWorkoutHistory;
  }

  function sessionOn(result: ClientWorkoutHistory, date: string): TrainerWorkoutSession {
    const found = result.sessions.find((session) => session.date === date);

    if (found === undefined) {
      throw new Error(`No session on ${date}: ${result.sessions.map((s) => s.date).join(', ')}`);
    }

    return found;
  }

  describe('the four exercise states', () => {
    it('pairs a matching record with its prescription as DONE', async () => {
      const { squat, plank } = lineIds(await assign());
      await log(squat, YESTERDAY, AS_PRESCRIBED);
      await log(plank, YESTERDAY, PLANK_DONE);

      const session = sessionOn(await history(), YESTERDAY);

      expect(session.state).toBe('DONE');
      expect(session.exercises.map((exercise) => exercise.state)).toEqual(['DONE', 'DONE']);

      const [squatLine] = session.exercises;
      expect(squatLine!.planned).toMatchObject({
        sets: 5,
        reps: 5,
        loadValue: 82.5,
        loadUnit: 'KG',
      });
      expect(squatLine!.planned.exercise.name).toBe('Присідання');
      expect(squatLine!.actual?.sets).toHaveLength(5);
      expect(session.loggedAt).not.toBeNull();
    });

    it('marks a record that differs from the prescription as DEVIATED', async () => {
      const { squat } = lineIds(await assign());
      // Planned 5×5 · 82,5 кг; actually four reps at 80 on every set.
      await log(squat, YESTERDAY, {
        completed: true,
        sets: Array.from({ length: 5 }, () => ({ reps: 4, loadKg: 80 })),
      });

      const [squatLine] = sessionOn(await history(), YESTERDAY).exercises;

      expect(squatLine!.state).toBe('DEVIATED');
      expect(squatLine!.planned.reps).toBe(5);
      expect(squatLine!.actual?.sets[0]).toMatchObject({ reps: 4, loadKg: 80 });
    });

    it('counts a short set list as a deviation', async () => {
      const { squat } = lineIds(await assign());
      await log(squat, YESTERDAY, { completed: true, sets: [{ reps: 5, loadKg: 82.5 }] });

      expect(sessionOn(await history(), YESTERDAY).exercises[0]!.state).toBe('DEVIATED');
    });

    it('surfaces a deliberate skip with its reason', async () => {
      const { squat } = lineIds(await assign());
      await log(squat, YESTERDAY, { completed: false, notes: 'біль у коліні', sets: [] });

      const [squatLine] = sessionOn(await history(), YESTERDAY).exercises;

      expect(squatLine!.state).toBe('SKIPPED');
      expect(squatLine!.actual?.notes).toBe('біль у коліні');
      expect(squatLine!.actual?.completed).toBe(false);
    });

    it('reports a scheduled exercise with no record at all as MISSING', async () => {
      await assign();

      const session = sessionOn(await history(), YESTERDAY);

      expect(session.state).toBe('MISSED');
      expect(session.exercises.map((exercise) => exercise.state)).toEqual(['MISSING', 'MISSING']);
      expect(session.exercises[0]!.actual).toBeNull();
      // The prescription is there even though nothing was recorded against it.
      expect(session.exercises[0]!.planned.sets).toBe(5);
      expect(session.loggedAt).toBeNull();
    });

    it('never invents a deviation from a load it cannot compare', async () => {
      const rpeProgram = (
        (
          await request(harness.app.getHttpServer())
            .post('/programs')
            .set('Cookie', cookieA)
            .send({
              name: 'RPE день',
              type: 'STRENGTH',
              sections: [
                {
                  type: 'STRENGTH',
                  exercises: [
                    { exerciseId: squatId, sets: 2, reps: 3, loadValue: 8, loadUnit: 'RPE' },
                    { exerciseId: plankId, sets: 1, reps: 10, loadText: 'з гумкою' },
                  ],
                },
              ],
            })
            .expect(201)
        ).body as PublicProgramDetail
      ).id;

      const assignment = (
        await request(harness.app.getHttpServer())
          .post(`/clients/${clientId}/assignments`)
          .set('Cookie', cookieA)
          .send({ programId: rpeProgram, startDate: isoDate(-30), daysOfWeek: EVERY_DAY })
          .expect(201)
      ).body as PublicAssignmentDetail;
      const { squat, plank } = lineIds(assignment);

      // Real kilograms against an RPE target, and against a worded load.
      await log(squat, YESTERDAY, {
        completed: true,
        sets: [
          { reps: 3, loadKg: 90 },
          { reps: 3, loadKg: 95 },
        ],
      });
      await log(plank, YESTERDAY, { completed: true, sets: [{ reps: 10, loadKg: 12 }] });

      const session = (await history()).sessions.find(
        (candidate) => candidate.assignmentId === assignment.id && candidate.date === YESTERDAY,
      );
      expect(session?.exercises.map((exercise) => exercise.state)).toEqual(['DONE', 'DONE']);
    });

    it('treats a blank actual field as silence, not disagreement', async () => {
      const { plank } = lineIds(await assign());
      await log(plank, YESTERDAY, { completed: true, sets: [{}] });

      expect(sessionOn(await history(), YESTERDAY).exercises[1]!.state).toBe('DONE');
    });
  });

  describe('session states', () => {
    it('is PARTIAL when only some exercises were done', async () => {
      const { squat } = lineIds(await assign());
      await log(squat, YESTERDAY, AS_PRESCRIBED);

      const session = sessionOn(await history(), YESTERDAY);

      expect(session.state).toBe('PARTIAL');
      expect(session.exercises.map((exercise) => exercise.state)).toEqual(['DONE', 'MISSING']);
    });

    it('separates a session skipped with reasons from one nobody touched', async () => {
      const { squat, plank } = lineIds(await assign());
      await log(squat, YESTERDAY, { completed: false, notes: 'біль у коліні', sets: [] });
      await log(plank, YESTERDAY, { completed: false, notes: 'те саме', sets: [] });

      const result = await history();

      expect(sessionOn(result, YESTERDAY).state).toBe('SKIPPED');
      expect(sessionOn(result, isoDate(-2)).state).toBe('MISSED');
    });
  });

  describe('adherence', () => {
    it('counts scheduled sessions, including the ones nothing was recorded for', async () => {
      const { squat, plank } = lineIds(
        await assign({ startDate: isoDate(-4), daysOfWeek: EVERY_DAY }),
      );

      await log(squat, isoDate(-1), AS_PRESCRIBED);
      await log(plank, isoDate(-1), PLANK_DONE);
      await log(squat, isoDate(-2), AS_PRESCRIBED);
      await log(plank, isoDate(-3), { completed: false, notes: 'втома', sets: [] });
      await log(squat, isoDate(-3), { completed: false, notes: 'втома', sets: [] });

      const { adherence } = await history();

      // Four past days scheduled (-4…-1); today is not counted, it is not over.
      expect(adherence).toEqual({ scheduled: 4, done: 1, partial: 1, skipped: 1, missed: 1 });
      expect(adherence.done + adherence.partial + adherence.skipped + adherence.missed).toBe(
        adherence.scheduled,
      );
    });

    it('counts only days the schedule actually calls for', async () => {
      // A single weekday: exactly one occurrence in the last seven days.
      const weekday = new Date(`${YESTERDAY}T00:00:00.000Z`).getUTCDay();
      await assign({ startDate: isoDate(-7), daysOfWeek: [weekday === 0 ? 7 : weekday] });

      const result = await history(`?from=${isoDate(-7)}&to=${isoDate(-1)}`);

      expect(result.adherence.scheduled).toBe(1);
      expect(result.sessions[0]?.date).toBe(YESTERDAY);
    });

    it('does not count today as missed before the day is over', async () => {
      await assign({ startDate: isoDate(0), daysOfWeek: EVERY_DAY });

      const result = await history();

      expect(result.sessions).toHaveLength(0);
      expect(result.adherence.scheduled).toBe(0);
    });

    it('shows today once the client has recorded something', async () => {
      const { squat } = lineIds(await assign({ startDate: isoDate(0), daysOfWeek: EVERY_DAY }));
      await log(squat, isoDate(0), AS_PRESCRIBED);

      const result = await history();

      expect(result.sessions.map((session) => session.date)).toEqual([isoDate(0)]);
      expect(result.sessions[0]?.state).toBe('PARTIAL');
    });
  });

  describe('the range', () => {
    it('defaults to the last four weeks and honours an explicit range', async () => {
      await assign({ startDate: isoDate(-60), daysOfWeek: EVERY_DAY });

      const byDefault = await history();
      expect(byDefault.from).toBe(isoDate(-27));
      expect(byDefault.to).toBe(isoDate(0));
      expect(byDefault.adherence.scheduled).toBe(27);

      const narrow = await history(`?from=${isoDate(-3)}&to=${isoDate(-1)}`);
      expect(narrow.sessions.map((session) => session.date)).toEqual([
        isoDate(-1),
        isoDate(-2),
        isoDate(-3),
      ]);
    });

    it('keeps records outside the range out of it', async () => {
      const { squat } = lineIds(await assign({ startDate: isoDate(-20), daysOfWeek: EVERY_DAY }));
      await log(squat, isoDate(-10), AS_PRESCRIBED);

      const result = await history(`?from=${isoDate(-3)}&to=${isoDate(-1)}`);

      expect(result.sessions).toHaveLength(3);
      expect(result.sessions.every((session) => session.state === 'MISSED')).toBe(true);
    });

    it('rejects an inverted, oversized or impossible range', async () => {
      for (const query of [
        `?from=${isoDate(-1)}&to=${isoDate(-5)}`,
        `?from=${isoDate(-200)}&to=${isoDate(0)}`,
        '?from=2026-02-31',
        '?from=01.08.2026',
      ]) {
        await request(harness.app.getHttpServer())
          .get(`/clients/${clientId}/workout-history${query}`)
          .set('Cookie', cookieA)
          .expect(400);
      }
    });
  });

  describe('assignment status', () => {
    it('keeps a completed cycle in history and drops an archived one', async () => {
      const assignment = await assign({ startDate: isoDate(-3), daysOfWeek: EVERY_DAY });
      const { squat } = lineIds(assignment);
      await log(squat, YESTERDAY, AS_PRESCRIBED);

      async function setStatus(status: string): Promise<void> {
        await request(harness.app.getHttpServer())
          .patch(`/assignments/${assignment.id}`)
          .set('Cookie', cookieA)
          .send({ status })
          .expect(200);
      }

      await setStatus('COMPLETED');
      const completed = await history();
      expect(completed.adherence.scheduled).toBe(3);
      expect(sessionOn(completed, YESTERDAY).state).toBe('PARTIAL');

      await setStatus('ARCHIVED');
      const archived = await history();
      expect(archived.sessions).toHaveLength(0);
      expect(archived.adherence.scheduled).toBe(0);
    });
  });

  describe('tenancy', () => {
    it("answers for another trainer's client exactly like a nonexistent one", async () => {
      await assign();

      const foreign = await request(harness.app.getHttpServer())
        .get(`/clients/${clientId}/workout-history`)
        .set('Cookie', cookieB)
        .expect(404);
      const missing = await request(harness.app.getHttpServer())
        .get(`/clients/${NONEXISTENT_ID}/workout-history`)
        .set('Cookie', cookieB)
        .expect(404);

      expect(foreign.body).toEqual(missing.body);
    });

    it("never mixes in a sibling client's records", async () => {
      const { squat } = lineIds(await assign());
      await log(squat, YESTERDAY, AS_PRESCRIBED);

      const sibling = await createAcceptedClient(harness, cookieA, {
        fullName: 'Інший Клієнт',
        email: 'sibling@example.com',
      });

      const theirs = await history('', cookieA, sibling.clientId);
      expect(theirs.sessions).toHaveLength(0);
      expect(theirs.adherence.scheduled).toBe(0);
    });

    it('turns a client session away exactly like an anonymous one', async () => {
      const asClient = await request(harness.app.getHttpServer())
        .get(`/clients/${clientId}/workout-history`)
        .set('Cookie', clientCookie)
        .expect(401);
      const anonymous = await request(harness.app.getHttpServer())
        .get(`/clients/${clientId}/workout-history`)
        .expect(401);

      expect(asClient.body).toEqual(anonymous.body);
    });
  });

  describe('the clients list signal', () => {
    async function clients(cookie = cookieA): Promise<ClientListItem[]> {
      return (
        await request(harness.app.getHttpServer()).get('/clients').set('Cookie', cookie).expect(200)
      ).body as ClientListItem[];
    }

    function rowFor(list: ClientListItem[], id: string): ClientListItem {
      const row = list.find((client) => client.id === id);

      if (row === undefined) {
        throw new Error('Client missing from the list');
      }

      return row;
    }

    it('stays quiet for a client who is keeping up', async () => {
      const { squat, plank } = lineIds(
        await assign({ startDate: isoDate(-1), daysOfWeek: EVERY_DAY }),
      );
      await log(squat, YESTERDAY, AS_PRESCRIBED);
      await log(plank, YESTERDAY, PLANK_DONE);

      const row = rowFor(await clients(), clientId);

      expect(row.attention).toBeNull();
      expect(row.lastLoggedAt).not.toBeNull();
    });

    it('raises a stated skip above silent misses', async () => {
      const { squat } = lineIds(await assign({ startDate: isoDate(-6), daysOfWeek: EVERY_DAY }));
      await log(squat, YESTERDAY, { completed: false, notes: 'біль у коліні', sets: [] });

      expect(rowFor(await clients(), clientId).attention).toBe('SKIPPED');
    });

    it('flags repeated silence, but not a single missed day', async () => {
      const { squat, plank } = lineIds(
        await assign({ startDate: isoDate(-2), daysOfWeek: EVERY_DAY }),
      );

      // Yesterday recorded, the day before not: one miss is life.
      await log(squat, YESTERDAY, AS_PRESCRIBED);
      await log(plank, YESTERDAY, PLANK_DONE);
      expect(rowFor(await clients(), clientId).attention).toBeNull();

      // Remove that record and both scheduled days become silent.
      await request(harness.app.getHttpServer())
        .delete(`/me/assignment-exercises/${squat}/logs/${YESTERDAY}`)
        .set('Cookie', clientCookie)
        .expect(204);
      await request(harness.app.getHttpServer())
        .delete(`/me/assignment-exercises/${plank}/logs/${YESTERDAY}`)
        .set('Cookie', clientCookie)
        .expect(204);

      expect(rowFor(await clients(), clientId).attention).toBe('MISSED');
    });

    it('computes nothing from another trainer, and nothing for the invited', async () => {
      const { squat } = lineIds(await assign({ startDate: isoDate(-6), daysOfWeek: EVERY_DAY }));
      await log(squat, YESTERDAY, { completed: false, notes: 'біль', sets: [] });

      // Trainer B has their own client with the same name and no activity.
      const theirClient = await createAcceptedClient(harness, cookieB, {
        fullName: 'Чужий Клієнт',
        email: 'foreign-client@example.com',
      });

      const theirList = await clients(cookieB);
      expect(theirList).toHaveLength(1);
      expect(rowFor(theirList, theirClient.clientId)).toMatchObject({
        attention: null,
        lastLoggedAt: null,
      });
    });
  });
});
