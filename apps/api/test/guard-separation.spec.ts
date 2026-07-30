import request from 'supertest';

import {
  createAcceptedClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
  sessionCookie,
  validRegistration,
} from './app-harness';

/**
 * The guard split's contract: a session acts only in the context it was issued
 * for, and being turned away looks exactly like never having been there. Every
 * cross-context assertion compares against the no-cookie response — a special
 * body or a 403 would confirm the cookie names a real session of the other
 * type.
 */
describe('guard separation', () => {
  let harness: Harness;
  let trainerCookie: string;
  let clientCookie: string;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    trainerCookie = await registerTrainer(harness);
    clientCookie = (await createAcceptedClient(harness, trainerCookie)).clientCookie;
  });

  it.each([
    ['GET /auth/me', () => request(harness.app.getHttpServer()).get('/auth/me')],
    ['GET /clients', () => request(harness.app.getHttpServer()).get('/clients')],
    [
      'POST /clients',
      () =>
        request(harness.app.getHttpServer())
          .post('/clients')
          .send({ fullName: 'Хтось', email: 'x@example.com' }),
    ],
  ])('turns a client session away from %s exactly like no session', async (_label, call) => {
    const withClientCookie = await call().set('Cookie', clientCookie).expect(401);
    const withoutCookie = await call().expect(401);

    expect(withClientCookie.body).toEqual(withoutCookie.body);
  });

  it('turns a trainer session away from client routes exactly like no session', async () => {
    const withTrainerCookie = await request(harness.app.getHttpServer())
      .get('/auth/client/me')
      .set('Cookie', trainerCookie)
      .expect(401);
    const withoutCookie = await request(harness.app.getHttpServer())
      .get('/auth/client/me')
      .expect(401);

    expect(withTrainerCookie.body).toEqual(withoutCookie.body);
  });

  it('leaves the trainer session fully functional on its own routes', async () => {
    await request(harness.app.getHttpServer())
      .get('/clients')
      .set('Cookie', trainerCookie)
      .expect(200);
    await request(harness.app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', trainerCookie)
      .expect(200);
  });

  it('a rejected cross-context write changes nothing', async () => {
    await request(harness.app.getHttpServer())
      .post('/clients')
      .set('Cookie', clientCookie)
      .send({ fullName: 'Зловмисник', email: 'evil@example.com' })
      .expect(401);

    expect(await harness.prisma.client.count()).toBe(1);
  });

  describe('a user who is both a trainer and a client', () => {
    /**
     * No API path creates this state yet — register refuses existing emails and
     * accept-invite refuses existing users — but team members and multi-trainer
     * linking will. The guards must already be correct, so the state is
     * constructed directly.
     */
    beforeEach(async () => {
      await registerTrainer(harness, secondRegistration);

      const firstTrainer = await harness.prisma.trainer.findFirstOrThrow({
        where: { displayName: validRegistration.displayName },
      });
      const secondUser = await harness.prisma.user.findUniqueOrThrow({
        where: { email: secondRegistration.email },
      });

      // The second trainer becomes a client of the first.
      await harness.prisma.client.create({
        data: {
          trainerId: firstTrainer.id,
          userId: secondUser.id,
          fullName: secondRegistration.displayName,
          email: secondRegistration.email,
          status: 'ACTIVE',
        },
      });
    });

    it('gives the trainer door a trainer hat, useless on client routes', async () => {
      const cookie = sessionCookie(
        (
          await request(harness.app.getHttpServer())
            .post('/auth/login')
            .send({ email: secondRegistration.email, password: secondRegistration.password })
            .expect(200)
        ).headers as Record<string, unknown>,
      );

      await request(harness.app.getHttpServer()).get('/auth/me').set('Cookie', cookie).expect(200);
      await request(harness.app.getHttpServer())
        .get('/auth/client/me')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('gives the client door a client hat, useless on trainer routes', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/auth/client/login')
        .send({ email: secondRegistration.email, password: secondRegistration.password })
        .expect(200);

      // The client hat is scoped to the FIRST trainer — the tenant that owns
      // the client profile, not the trainer the user happens to be.
      expect(response.body).toMatchObject({
        trainer: { displayName: validRegistration.displayName },
      });

      const cookie = sessionCookie(response.headers as Record<string, unknown>);

      await request(harness.app.getHttpServer())
        .get('/auth/client/me')
        .set('Cookie', cookie)
        .expect(200);
      await request(harness.app.getHttpServer()).get('/auth/me').set('Cookie', cookie).expect(401);
      await request(harness.app.getHttpServer()).get('/clients').set('Cookie', cookie).expect(401);
    });
  });
});
