import request from 'supertest';

import {
  createHarness,
  type Harness,
  resetDatabase,
  sessionCookie,
  validRegistration,
} from './app-harness';

describe('session lifecycle', () => {
  let harness: Harness;
  let cookie: string;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);

    const registered = await request(harness.app.getHttpServer())
      .post('/auth/register')
      .send(validRegistration)
      .expect(201);

    cookie = sessionCookie(registered.headers as Record<string, unknown>);
  });

  it('rejects GET /auth/me without a cookie', async () => {
    await request(harness.app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rejects GET /auth/me with a forged cookie', async () => {
    await request(harness.app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', 'gart_session=not-a-real-token')
      .expect(401);
  });

  it('returns the user and their tenant with a valid cookie', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body).toMatchObject({
      user: { email: validRegistration.email },
      trainer: { displayName: validRegistration.displayName },
    });
  });

  it('clears the cookie and deletes the session on logout', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    expect((response.headers as Record<string, string[]>)['set-cookie'].join(';')).toContain(
      'gart_session=;',
    );
    expect(await harness.prisma.session.count()).toBe(0);
  });

  it('refuses a replayed cookie after logout', async () => {
    await request(harness.app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    // The whole point of a server-side session: the old cookie is now inert,
    // which a stateless JWT could not guarantee.
    await request(harness.app.getHttpServer()).get('/auth/me').set('Cookie', cookie).expect(401);
  });

  it('rejects a session whose expiry has passed', async () => {
    await harness.prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    await request(harness.app.getHttpServer()).get('/auth/me').set('Cookie', cookie).expect(401);
  });

  it('succeeds when logging out without a session', async () => {
    await request(harness.app.getHttpServer()).post('/auth/logout').expect(204);
  });
});
