import request from 'supertest';

import type { PublicAssignment, PublicAssignmentDetail, PublicProgramDetail } from '@gart/shared';

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

const NONEXISTENT_ID = 'cl00000000000000000000000';

describe('assignments (copy-on-assign)', () => {
  let harness: Harness;
  let cookieA: string;
  let cookieB: string;
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
    clientId = (await createClient(harness, cookieA)).client.id;

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
            description: 'база',
            type: 'STRENGTH',
            sections: [
              {
                name: 'Розминка',
                type: 'STRENGTH',
                exercises: [{ exerciseId: plankId, durationSeconds: 40 }],
              },
              {
                name: 'Фінішер',
                type: 'AMRAP',
                timeCapSeconds: 720,
                exercises: [
                  { exerciseId: squatId, reps: 12, loadValue: 82.5, loadUnit: 'KG' },
                  { exerciseId: plankId, durationSeconds: 30, loadText: 'до відмови' },
                ],
              },
            ],
          })
          .expect(201)
      ).body as PublicProgramDetail
    ).id;
  });

  function assign(
    cookie: string,
    targetClientId: string,
    body: Record<string, unknown> = {
      programId,
      startDate: '2026-08-03',
      daysOfWeek: [1, 3, 5],
    },
  ) {
    return request(harness.app.getHttpServer())
      .post(`/clients/${targetClientId}/assignments`)
      .set('Cookie', cookie)
      .send(body);
  }

  async function getAssignment(id: string): Promise<PublicAssignmentDetail> {
    return (
      await request(harness.app.getHttpServer())
        .get(`/assignments/${id}`)
        .set('Cookie', cookieA)
        .expect(200)
    ).body as PublicAssignmentDetail;
  }

  /** Everything that must be frozen, stripped of ids and timestamps. */
  function frozenShape(detail: PublicAssignmentDetail | PublicProgramDetail) {
    return detail.sections.map((section) => ({
      name: section.name,
      type: section.type,
      timeCapSeconds: section.timeCapSeconds,
      intervalSeconds: section.intervalSeconds,
      rounds: section.rounds,
      restBetweenRoundsSeconds: section.restBetweenRoundsSeconds,
      exercises: section.exercises.map((line) => ({
        exerciseId: line.exercise.id,
        sets: line.sets,
        reps: line.reps,
        loadValue: line.loadValue,
        loadUnit: line.loadUnit,
        loadText: line.loadText,
        restSeconds: line.restSeconds,
        tempo: line.tempo,
        notes: line.notes,
        durationSeconds: line.durationSeconds,
        distanceMeters: line.distanceMeters,
      })),
    }));
  }

  describe('the invariant', () => {
    it('snapshots the whole tree, equal to the template at assign time', async () => {
      const template = (
        await request(harness.app.getHttpServer())
          .get(`/programs/${programId}`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body as PublicProgramDetail;

      const created = (await assign(cookieA, clientId).expect(201)).body as PublicAssignmentDetail;

      expect(created.name).toBe('Сила: день 1');
      expect(created.type).toBe('STRENGTH');
      expect(created.sourceProgramId).toBe(programId);
      expect(created.sectionCount).toBe(2);
      expect(created.exerciseCount).toBe(3);
      expect(frozenShape(created)).toEqual(frozenShape(template));

      // The snapshot is real rows, not references to the template's rows.
      const templateSectionIds = template.sections.map((section) => section.id);
      for (const section of created.sections) {
        expect(templateSectionIds).not.toContain(section.id);
      }
    });

    it('is untouched by any later edit of the template', async () => {
      const created = (await assign(cookieA, clientId).expect(201)).body as PublicAssignmentDetail;
      const before = frozenShape(created);

      // Rewrite the template beyond recognition.
      await request(harness.app.getHttpServer())
        .patch(`/programs/${programId}`)
        .set('Cookie', cookieA)
        .send({
          name: 'Зовсім інша програма',
          type: 'CIRCUIT',
          sections: [
            {
              name: 'Єдина секція',
              type: 'CIRCUIT',
              rounds: 5,
              exercises: [{ exerciseId: squatId, reps: 20 }],
            },
          ],
        })
        .expect(200);

      const after = await getAssignment(created.id);

      expect(after.name).toBe('Сила: день 1');
      expect(after.type).toBe('STRENGTH');
      expect(frozenShape(after)).toEqual(before);
    });

    it('survives template deletion intact, with sourceProgramId nulled', async () => {
      const created = (await assign(cookieA, clientId).expect(201)).body as PublicAssignmentDetail;
      const before = frozenShape(created);

      await request(harness.app.getHttpServer())
        .delete(`/programs/${programId}`)
        .set('Cookie', cookieA)
        .expect(204);

      const after = await getAssignment(created.id);

      expect(after.sourceProgramId).toBeNull();
      expect(after.name).toBe('Сила: день 1');
      expect(frozenShape(after)).toEqual(before);
      expect(after.sectionCount).toBe(2);
    });

    it('keeps snapshot ids stable across reads and schedule updates', async () => {
      const created = (await assign(cookieA, clientId).expect(201)).body as PublicAssignmentDetail;

      const idsOf = (detail: PublicAssignmentDetail) =>
        detail.sections.flatMap((section) => [
          section.id,
          ...section.exercises.map((line) => line.id),
        ]);

      const first = await getAssignment(created.id);

      await request(harness.app.getHttpServer())
        .patch(`/assignments/${created.id}`)
        .set('Cookie', cookieA)
        .send({ status: 'COMPLETED', daysOfWeek: [2, 4] })
        .expect(200);

      const second = await getAssignment(created.id);

      expect(idsOf(second)).toEqual(idsOf(first));
    });

    it('extends the exercise-delete contract: referenced by a snapshot → 409', async () => {
      // Own custom exercise, referenced only through the assignment.
      const customId = await request(harness.app.getHttpServer())
        .post('/exercises')
        .set('Cookie', cookieA)
        .send({ name: 'Випади', primaryMuscleGroup: 'LEGS' })
        .expect(201)
        .then((response) => (response.body as { id: string }).id);
      const soloProgram = (
        await request(harness.app.getHttpServer())
          .post('/programs')
          .set('Cookie', cookieA)
          .send({
            name: 'Соло',
            type: 'STRENGTH',
            sections: [{ type: 'STRENGTH', exercises: [{ exerciseId: customId }] }],
          })
          .expect(201)
      ).body as PublicProgramDetail;

      const created = (
        await assign(cookieA, clientId, {
          programId: soloProgram.id,
          startDate: '2026-08-03',
          daysOfWeek: [1],
        }).expect(201)
      ).body as PublicAssignmentDetail;

      // Template gone — only the snapshot still references the exercise.
      await request(harness.app.getHttpServer())
        .delete(`/programs/${soloProgram.id}`)
        .set('Cookie', cookieA)
        .expect(204);

      const refused = await request(harness.app.getHttpServer())
        .delete(`/exercises/${customId}`)
        .set('Cookie', cookieA)
        .expect(409);
      expect(refused.body).toMatchObject({ message: 'Вправа використовується у програмі' });

      // Deleting the assignment releases it.
      await request(harness.app.getHttpServer())
        .delete(`/assignments/${created.id}`)
        .set('Cookie', cookieA)
        .expect(204);
      await request(harness.app.getHttpServer())
        .delete(`/exercises/${customId}`)
        .set('Cookie', cookieA)
        .expect(204);
    });
  });

  describe('tenancy', () => {
    it("treats another trainer's program exactly like a nonexistent one", async () => {
      const foreignProgram = (
        await request(harness.app.getHttpServer())
          .post('/programs')
          .set('Cookie', cookieB)
          .send({ name: 'Чужа', type: 'CUSTOM', sections: [] })
          .expect(201)
      ).body as PublicProgramDetail;

      const foreign = await assign(cookieA, clientId, {
        programId: foreignProgram.id,
        startDate: '2026-08-03',
        daysOfWeek: [1],
      }).expect(400);
      const missing = await assign(cookieA, clientId, {
        programId: NONEXISTENT_ID,
        startDate: '2026-08-03',
        daysOfWeek: [1],
      }).expect(400);

      expect(foreign.body).toEqual(missing.body);
      expect(await harness.prisma.assignment.count()).toBe(0);
    });

    it("treats another trainer's client exactly like a nonexistent one", async () => {
      const foreign = await assign(cookieB, clientId).expect(404);
      const missing = await assign(cookieB, NONEXISTENT_ID).expect(404);

      expect(foreign.body).toEqual(missing.body);
      expect(await harness.prisma.assignment.count()).toBe(0);
    });

    it("hides A's assignment from B behind an ordinary 404, row untouched", async () => {
      const created = (await assign(cookieA, clientId).expect(201)).body as PublicAssignmentDetail;

      const foreignGet = await request(harness.app.getHttpServer())
        .get(`/assignments/${created.id}`)
        .set('Cookie', cookieB)
        .expect(404);
      const missingGet = await request(harness.app.getHttpServer())
        .get(`/assignments/${NONEXISTENT_ID}`)
        .set('Cookie', cookieB)
        .expect(404);
      expect(foreignGet.body).toEqual(missingGet.body);

      await request(harness.app.getHttpServer())
        .patch(`/assignments/${created.id}`)
        .set('Cookie', cookieB)
        .send({ status: 'ARCHIVED' })
        .expect(404);
      await request(harness.app.getHttpServer())
        .delete(`/assignments/${created.id}`)
        .set('Cookie', cookieB)
        .expect(404);

      const untouched = await harness.prisma.assignment.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(untouched.status).toBe('ACTIVE');
    });

    it('lists only that client’s assignments, newest first', async () => {
      await assign(cookieA, clientId).expect(201);
      const otherClient = (
        await createClient(harness, cookieA, { fullName: 'Інша', email: 'other@example.com' })
      ).client.id;
      await assign(cookieA, otherClient).expect(201);

      const list = (
        await request(harness.app.getHttpServer())
          .get(`/clients/${clientId}/assignments`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body as PublicAssignment[];

      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ name: 'Сила: день 1', sectionCount: 2, exerciseCount: 3 });
    });

    it('rejects a client-context session exactly like no session', async () => {
      const { clientCookie } = await createAcceptedClient(harness, cookieA, {
        fullName: 'Клієнт',
        email: 'session-client@example.com',
      });

      const withClient = await request(harness.app.getHttpServer())
        .get(`/clients/${clientId}/assignments`)
        .set('Cookie', clientCookie)
        .expect(401);
      const without = await request(harness.app.getHttpServer())
        .get(`/clients/${clientId}/assignments`)
        .expect(401);

      expect(withClient.body).toEqual(without.body);
    });
  });

  describe('schedule and status', () => {
    it('round-trips the schedule and sorts the days', async () => {
      const created = (
        await assign(cookieA, clientId, {
          programId,
          startDate: '2026-08-03',
          endDate: '2026-09-28',
          daysOfWeek: [5, 1, 3],
        }).expect(201)
      ).body as PublicAssignmentDetail;

      expect(created).toMatchObject({
        startDate: '2026-08-03',
        endDate: '2026-09-28',
        daysOfWeek: [1, 3, 5],
        status: 'ACTIVE',
      });
    });

    it.each([
      [
        'an end date before the start',
        { startDate: '2026-08-03', endDate: '2026-08-01', daysOfWeek: [1] },
      ],
      ['no days at all', { startDate: '2026-08-03', daysOfWeek: [] }],
      ['a day out of range', { startDate: '2026-08-03', daysOfWeek: [8] }],
      ['duplicate days', { startDate: '2026-08-03', daysOfWeek: [1, 1] }],
      ['a malformed date', { startDate: '03.08.2026', daysOfWeek: [1] }],
    ])('rejects %s', async (_label, schedule) => {
      await assign(cookieA, clientId, { programId, ...schedule }).expect(400);
      expect(await harness.prisma.assignment.count()).toBe(0);
    });

    it('refuses to assign to an archived client', async () => {
      await harness.prisma.client.update({
        where: { id: clientId },
        data: { status: 'ARCHIVED' },
      });

      const response = await assign(cookieA, clientId).expect(400);
      expect(response.body).toMatchObject({ message: 'Клієнт в архіві' });
    });

    it('cycles status and updates the schedule', async () => {
      const created = (await assign(cookieA, clientId).expect(201)).body as PublicAssignmentDetail;

      for (const status of ['COMPLETED', 'ARCHIVED', 'ACTIVE'] as const) {
        const updated = (
          await request(harness.app.getHttpServer())
            .patch(`/assignments/${created.id}`)
            .set('Cookie', cookieA)
            .send({ status })
            .expect(200)
        ).body as PublicAssignmentDetail;

        expect(updated.status).toBe(status);
      }

      const rescheduled = (
        await request(harness.app.getHttpServer())
          .patch(`/assignments/${created.id}`)
          .set('Cookie', cookieA)
          .send({ startDate: '2026-09-01', endDate: null, daysOfWeek: [2, 4, 6] })
          .expect(200)
      ).body as PublicAssignmentDetail;

      expect(rescheduled).toMatchObject({
        startDate: '2026-09-01',
        endDate: null,
        daysOfWeek: [2, 4, 6],
      });
    });

    it('rejects an end date before the start on PATCH too', async () => {
      const created = (await assign(cookieA, clientId).expect(201)).body as PublicAssignmentDetail;

      await request(harness.app.getHttpServer())
        .patch(`/assignments/${created.id}`)
        .set('Cookie', cookieA)
        .send({ endDate: '2026-08-01' })
        .expect(400);
    });

    it('has no way to express a tree update', async () => {
      const created = (await assign(cookieA, clientId).expect(201)).body as PublicAssignmentDetail;

      await request(harness.app.getHttpServer())
        .patch(`/assignments/${created.id}`)
        .set('Cookie', cookieA)
        .send({ sections: [] })
        .expect(400);
    });
  });

  describe('deletion boundaries', () => {
    it('deleting the assignment removes the snapshot, touches nothing else', async () => {
      const created = (await assign(cookieA, clientId).expect(201)).body as PublicAssignmentDetail;

      await request(harness.app.getHttpServer())
        .delete(`/assignments/${created.id}`)
        .set('Cookie', cookieA)
        .expect(204);

      expect(await harness.prisma.assignmentSection.count()).toBe(0);
      expect(await harness.prisma.assignmentExercise.count()).toBe(0);
      expect(await harness.prisma.program.count({ where: { id: programId } })).toBe(1);
      expect(
        await harness.prisma.exercise.count({ where: { id: { in: [squatId, plankId] } } }),
      ).toBe(2);
    });

    it('deleting the client cascades its assignments', async () => {
      await assign(cookieA, clientId).expect(201);

      await harness.prisma.client.delete({ where: { id: clientId } });

      expect(await harness.prisma.assignment.count()).toBe(0);
      expect(await harness.prisma.assignmentExercise.count()).toBe(0);
    });
  });
});
