import request from 'supertest';

import type { ProgramPage, PublicProgramDetail } from '@gart/shared';

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

describe('program builder', () => {
  let harness: Harness;
  let cookieA: string;
  let cookieB: string;
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

    // One global and one A-custom exercise, referenced throughout.
    squatId = (
      await harness.prisma.exercise.create({
        data: { name: 'Присідання', primaryMuscleGroup: 'LEGS', muscleGroups: [] },
      })
    ).id;
    plankId = await request(harness.app.getHttpServer())
      .post('/exercises')
      .set('Cookie', cookieA)
      .send({ name: 'Планка', primaryMuscleGroup: 'CORE' })
      .expect(201)
      .then((response) => (response.body as { id: string }).id);
  });

  function post(cookie: string, body: Record<string, unknown>) {
    return request(harness.app.getHttpServer()).post('/programs').set('Cookie', cookie).send(body);
  }

  function strengthProgram(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      name: 'Сила: день 1',
      type: 'STRENGTH',
      sections: [
        {
          name: 'Розминка',
          type: 'STRENGTH',
          exercises: [{ exerciseId: plankId, durationSeconds: 40, notes: 'два кола' }],
        },
        {
          name: 'Основна частина',
          type: 'STRENGTH',
          exercises: [
            {
              exerciseId: squatId,
              sets: 5,
              reps: 5,
              loadValue: 82.5,
              loadUnit: 'KG',
              restSeconds: 180,
              tempo: '3-1-1',
            },
            { exerciseId: plankId, sets: 3, durationSeconds: 60 },
          ],
        },
      ],
      ...overrides,
    };
  }

  async function createProgram(
    cookie: string,
    body: Record<string, unknown>,
  ): Promise<PublicProgramDetail> {
    return post(cookie, body)
      .expect(201)
      .then((response) => response.body as PublicProgramDetail);
  }

  describe('create + read', () => {
    it('persists the whole tree in payload order', async () => {
      const created = await createProgram(cookieA, strengthProgram());

      const fetched = (
        await request(harness.app.getHttpServer())
          .get(`/programs/${created.id}`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body as PublicProgramDetail;

      expect(fetched.sections.map((section) => section.name)).toEqual([
        'Розминка',
        'Основна частина',
      ]);
      expect(fetched.sections[1]?.exercises.map((line) => line.exercise.name)).toEqual([
        'Присідання',
        'Планка',
      ]);
      expect(fetched.sections[1]?.exercises[0]).toMatchObject({
        sets: 5,
        reps: 5,
        loadValue: 82.5,
        loadUnit: 'KG',
        tempo: '3-1-1',
      });
      expect(fetched.sectionCount).toBe(2);
      expect(fetched.exerciseCount).toBe(3);
    });

    it.each([
      [
        'AMRAP',
        { type: 'AMRAP', timeCapSeconds: 720 },
        { timeCapSeconds: 720, intervalSeconds: null, rounds: null },
      ],
      [
        'EMOM',
        { type: 'EMOM', intervalSeconds: 60, rounds: 12 },
        { intervalSeconds: 60, rounds: 12, timeCapSeconds: null },
      ],
      [
        'CIRCUIT',
        { type: 'CIRCUIT', rounds: 4, restBetweenRoundsSeconds: 90 },
        { rounds: 4, restBetweenRoundsSeconds: 90, timeCapSeconds: null },
      ],
      ['CUSTOM', { type: 'CUSTOM', rounds: 2 }, { rounds: 2, timeCapSeconds: null }],
    ] as const)('round-trips a %s section', async (_label, config, expected) => {
      const created = await createProgram(cookieA, {
        name: `Тип ${_label}`,
        type: config.type,
        sections: [{ ...config, exercises: [{ exerciseId: squatId, reps: 10 }] }],
      });

      expect(created.sections[0]).toMatchObject(expected);
      expect(created.type).toBe(config.type);
    });

    it('round-trips a RUNNING program with distance and duration lines', async () => {
      const created = await createProgram(cookieA, {
        name: 'Інтервали',
        type: 'RUNNING',
        sections: [
          {
            type: 'RUNNING',
            rounds: 8,
            restBetweenRoundsSeconds: 90,
            exercises: [
              { exerciseId: squatId, distanceMeters: 400 },
              { exerciseId: squatId, durationSeconds: 90, notes: 'легкий темп' },
            ],
          },
        ],
      });

      expect(created.sections[0]?.exercises[0]?.distanceMeters).toBe(400);
      expect(created.sections[0]?.exercises[1]?.durationSeconds).toBe(90);
      expect(created.sections[0]?.rounds).toBe(8);
    });

    it('accepts loadText as the escape hatch', async () => {
      const created = await createProgram(cookieA, {
        name: 'До відмови',
        type: 'STRENGTH',
        sections: [
          {
            type: 'STRENGTH',
            exercises: [{ exerciseId: squatId, sets: 3, loadText: 'до відмови' }],
          },
        ],
      });

      expect(created.sections[0]?.exercises[0]).toMatchObject({
        loadText: 'до відмови',
        loadValue: null,
        loadUnit: null,
      });
    });

    it('accepts an empty draft', async () => {
      const created = await createProgram(cookieA, {
        name: 'Чернетка',
        type: 'CUSTOM',
        sections: [],
      });

      expect(created.sections).toEqual([]);
      expect(created.exerciseCount).toBe(0);
    });
  });

  describe('structure rules', () => {
    it.each([
      ['AMRAP without a time cap', { type: 'AMRAP' }],
      ['AMRAP with rounds', { type: 'AMRAP', timeCapSeconds: 600, rounds: 5 }],
      ['EMOM without an interval', { type: 'EMOM', rounds: 10 }],
      ['EMOM without rounds', { type: 'EMOM', intervalSeconds: 60 }],
      ['CIRCUIT without rounds', { type: 'CIRCUIT' }],
      ['a time cap on STRENGTH', { type: 'STRENGTH', timeCapSeconds: 600 }],
      ['rest between rounds without rounds', { type: 'STRENGTH', restBetweenRoundsSeconds: 60 }],
    ])('rejects %s', async (_label, section) => {
      await post(cookieA, {
        name: 'Погана структура',
        type: 'CUSTOM',
        sections: [{ ...section, exercises: [{ exerciseId: squatId }] }],
      }).expect(400);

      expect(await harness.prisma.program.count()).toBe(0);
    });

    it.each([
      ['a load value without a unit', { exerciseId: '', loadValue: 80 }],
      ['a unit without a value', { exerciseId: '', loadUnit: 'KG' }],
      [
        'text combined with a value',
        { exerciseId: '', loadValue: 80, loadUnit: 'KG', loadText: 'важко' },
      ],
    ])('rejects %s', async (_label, line) => {
      await post(cookieA, {
        name: 'Погане навантаження',
        type: 'STRENGTH',
        sections: [{ type: 'STRENGTH', exercises: [{ ...line, exerciseId: squatId }] }],
      }).expect(400);
    });

    it('rejects unknown properties deep in the tree', async () => {
      await post(cookieA, {
        name: 'Зайві поля',
        type: 'STRENGTH',
        sections: [{ type: 'STRENGTH', exercises: [{ exerciseId: squatId, order: 5 }] }],
      }).expect(400);

      await post(cookieA, {
        name: 'Зайві поля',
        type: 'STRENGTH',
        sections: [{ type: 'STRENGTH', trainerId: 'hijack', exercises: [] }],
      }).expect(400);
    });
  });

  describe('exercise references', () => {
    it("treats another trainer's custom exercise exactly like a nonexistent one", async () => {
      const foreignExercise = await request(harness.app.getHttpServer())
        .post('/exercises')
        .set('Cookie', cookieB)
        .send({ name: 'Чужа вправа', primaryMuscleGroup: 'BACK' })
        .expect(201)
        .then((response) => (response.body as { id: string }).id);

      const foreign = await post(cookieA, {
        name: 'З чужою вправою',
        type: 'STRENGTH',
        sections: [{ type: 'STRENGTH', exercises: [{ exerciseId: foreignExercise }] }],
      }).expect(400);
      const missing = await post(cookieA, {
        name: 'З неіснуючою',
        type: 'STRENGTH',
        sections: [{ type: 'STRENGTH', exercises: [{ exerciseId: NONEXISTENT_ID }] }],
      }).expect(400);

      expect(foreign.body).toEqual(missing.body);
      expect(await harness.prisma.program.count()).toBe(0);
    });

    it('re-validates references on PATCH', async () => {
      const created = await createProgram(cookieA, strengthProgram());

      await request(harness.app.getHttpServer())
        .patch(`/programs/${created.id}`)
        .set('Cookie', cookieA)
        .send({
          sections: [{ type: 'STRENGTH', exercises: [{ exerciseId: NONEXISTENT_ID }] }],
        })
        .expect(400);

      // The old tree survives a rejected replacement.
      const fetched = (
        await request(harness.app.getHttpServer())
          .get(`/programs/${created.id}`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body as PublicProgramDetail;
      expect(fetched.sectionCount).toBe(2);
    });
  });

  describe('update', () => {
    it('updates meta without touching the tree', async () => {
      const created = await createProgram(cookieA, strengthProgram());

      const updated = (
        await request(harness.app.getHttpServer())
          .patch(`/programs/${created.id}`)
          .set('Cookie', cookieA)
          .send({ name: 'Сила: оновлено', description: 'нова версія' })
          .expect(200)
      ).body as PublicProgramDetail;

      expect(updated.name).toBe('Сила: оновлено');
      expect(updated.sections.map((section) => section.id)).toEqual(
        created.sections.map((section) => section.id),
      );
    });

    it('replaces the tree wholesale when sections are present', async () => {
      const created = await createProgram(cookieA, strengthProgram());
      const oldSectionIds = created.sections.map((section) => section.id);

      const updated = (
        await request(harness.app.getHttpServer())
          .patch(`/programs/${created.id}`)
          .set('Cookie', cookieA)
          .send({
            sections: [
              {
                name: 'Фінішер',
                type: 'AMRAP',
                timeCapSeconds: 600,
                exercises: [{ exerciseId: plankId, reps: 15 }],
              },
            ],
          })
          .expect(200)
      ).body as PublicProgramDetail;

      expect(updated.sections).toHaveLength(1);
      expect(updated.sections[0]?.name).toBe('Фінішер');
      expect(oldSectionIds).not.toContain(updated.sections[0]?.id);
      // Nothing of the old tree lingers in the database.
      expect(await harness.prisma.programSection.count({ where: { programId: created.id } })).toBe(
        1,
      );
      expect(await harness.prisma.programExercise.count()).toBe(1);
    });

    it('persists a reorder expressed as array order', async () => {
      const created = await createProgram(cookieA, strengthProgram());

      const reversed = [...created.sections].reverse().map((section) => ({
        name: section.name,
        type: section.type,
        exercises: section.exercises.map((line) => ({ exerciseId: line.exercise.id })),
      }));

      const updated = (
        await request(harness.app.getHttpServer())
          .patch(`/programs/${created.id}`)
          .set('Cookie', cookieA)
          .send({ sections: reversed })
          .expect(200)
      ).body as PublicProgramDetail;

      expect(updated.sections.map((section) => section.name)).toEqual([
        'Основна частина',
        'Розминка',
      ]);

      const rows = await harness.prisma.programSection.findMany({
        where: { programId: created.id },
        orderBy: { order: 'asc' },
      });
      expect(rows.map((row) => row.name)).toEqual(['Основна частина', 'Розминка']);
    });
  });

  describe('tenant isolation', () => {
    it("hides A's program from B behind an ordinary 404, row untouched", async () => {
      const created = await createProgram(cookieA, strengthProgram());

      const foreignGet = await request(harness.app.getHttpServer())
        .get(`/programs/${created.id}`)
        .set('Cookie', cookieB)
        .expect(404);
      const missingGet = await request(harness.app.getHttpServer())
        .get(`/programs/${NONEXISTENT_ID}`)
        .set('Cookie', cookieB)
        .expect(404);
      expect(foreignGet.body).toEqual(missingGet.body);

      await request(harness.app.getHttpServer())
        .patch(`/programs/${created.id}`)
        .set('Cookie', cookieB)
        .send({ name: 'Викрадено' })
        .expect(404);
      await request(harness.app.getHttpServer())
        .delete(`/programs/${created.id}`)
        .set('Cookie', cookieB)
        .expect(404);

      const untouched = await harness.prisma.program.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(untouched.name).toBe('Сила: день 1');
    });

    it('lists only the caller’s programs, with counts', async () => {
      await createProgram(cookieA, strengthProgram());
      await createProgram(cookieB, {
        name: 'Чужа програма',
        type: 'CUSTOM',
        sections: [],
      });

      const page = (
        await request(harness.app.getHttpServer())
          .get('/programs')
          .set('Cookie', cookieA)
          .expect(200)
      ).body as ProgramPage;

      expect(page.total).toBe(1);
      expect(page.items[0]).toMatchObject({
        name: 'Сила: день 1',
        sectionCount: 2,
        exerciseCount: 3,
      });
    });

    it('rejects a client-context session exactly like no session', async () => {
      const { clientCookie } = await createAcceptedClient(harness, cookieA);

      const withClient = await request(harness.app.getHttpServer())
        .get('/programs')
        .set('Cookie', clientCookie)
        .expect(401);
      const without = await request(harness.app.getHttpServer()).get('/programs').expect(401);

      expect(withClient.body).toEqual(without.body);
    });
  });

  describe('deletion and the Step 7 contract', () => {
    it('deleting a program removes its tree but never the exercises', async () => {
      const created = await createProgram(cookieA, strengthProgram());

      await request(harness.app.getHttpServer())
        .delete(`/programs/${created.id}`)
        .set('Cookie', cookieA)
        .expect(204);

      expect(await harness.prisma.programSection.count()).toBe(0);
      expect(await harness.prisma.programExercise.count()).toBe(0);
      expect(
        await harness.prisma.exercise.count({ where: { id: { in: [squatId, plankId] } } }),
      ).toBe(2);
    });

    it('refuses to delete an exercise a program still uses — 409, row intact', async () => {
      await createProgram(cookieA, strengthProgram());

      const response = await request(harness.app.getHttpServer())
        .delete(`/exercises/${plankId}`)
        .set('Cookie', cookieA)
        .expect(409);

      expect(response.body).toMatchObject({ message: 'Вправа використовується у програмі' });
      expect(await harness.prisma.exercise.count({ where: { id: plankId } })).toBe(1);
    });

    it('deletes the same exercise once no program references it', async () => {
      const created = await createProgram(cookieA, strengthProgram());

      await request(harness.app.getHttpServer())
        .delete(`/programs/${created.id}`)
        .set('Cookie', cookieA)
        .expect(204);
      await request(harness.app.getHttpServer())
        .delete(`/exercises/${plankId}`)
        .set('Cookie', cookieA)
        .expect(204);
    });
  });
});
