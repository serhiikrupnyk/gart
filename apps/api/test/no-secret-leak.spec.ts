import request from 'supertest';

import {
  createHarness,
  type Harness,
  resetDatabase,
  sessionCookie,
  validRegistration,
} from './app-harness';

/**
 * Guards the one mistake that would be silent and permanent: a credential or
 * session token reaching a response body. Asserted over the whole serialised
 * payload rather than named fields, so a future nested object cannot smuggle
 * one through.
 */
describe('responses never leak credentials', () => {
  let harness: Harness;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
  });

  function assertClean(body: unknown): void {
    const serialised = JSON.stringify(body);

    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('$argon2');
    expect(serialised).not.toContain(validRegistration.password);
    expect(serialised).not.toContain('tokenHash');
  }

  it('keeps register, login and me clean', async () => {
    const registered = await request(harness.app.getHttpServer())
      .post('/auth/register')
      .send(validRegistration)
      .expect(201);
    assertClean(registered.body);

    const loggedIn = await request(harness.app.getHttpServer())
      .post('/auth/login')
      .send({ email: validRegistration.email, password: validRegistration.password })
      .expect(200);
    assertClean(loggedIn.body);

    const me = await request(harness.app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', sessionCookie(loggedIn.headers as Record<string, unknown>))
      .expect(200);
    assertClean(me.body);
  });

  it('keeps the session token out of the body, leaving it only in the cookie', async () => {
    const registered = await request(harness.app.getHttpServer())
      .post('/auth/register')
      .send(validRegistration)
      .expect(201);

    const cookie = sessionCookie(registered.headers as Record<string, unknown>);
    const token = cookie.replace('gart_session=', '');

    expect(token.length).toBeGreaterThan(20);
    expect(JSON.stringify(registered.body)).not.toContain(token);
  });
});
