import request from 'supertest';

import { PasswordService } from '../src/auth/password.service';
import { createHarness, type Harness, resetDatabase, validRegistration } from './app-harness';

const GENERIC_ERROR = 'Невірний email або пароль';

describe('POST /auth/login', () => {
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
    await request(harness.app.getHttpServer())
      .post('/auth/register')
      .send(validRegistration)
      .expect(201);
  });

  it('signs in with correct credentials', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/auth/login')
      .send({ email: validRegistration.email, password: validRegistration.password })
      .expect(200);

    expect(response.body).toMatchObject({
      user: { email: validRegistration.email },
      trainer: { displayName: validRegistration.displayName },
    });
    expect((response.headers as Record<string, string[]>)['set-cookie'].join(';')).toContain(
      'gart_session=',
    );
  });

  it('accepts a differently-cased email', async () => {
    await request(harness.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'TrAiNeR@GaRt.FiT', password: validRegistration.password })
      .expect(200);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(harness.app.getHttpServer())
      .post('/auth/login')
      .send({ email: validRegistration.email, password: 'definitely-not-it' })
      .expect(401);

    const unknownEmail = await request(harness.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@gart.fit', password: validRegistration.password })
      .expect(401);

    // Identical bodies: nothing distinguishes a registered email from an
    // unregistered one.
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body).toMatchObject({ message: GENERIC_ERROR });
    expect(unknownEmail.headers['set-cookie']).toBeUndefined();
  });

  it('still runs a hash verification when no account matched', async () => {
    // Without this the endpoint would return early for unknown emails and answer
    // measurably faster than for known ones, leaking which addresses exist.
    const passwords = harness.app.get(PasswordService);
    const verifyDummy = jest.spyOn(passwords, 'verifyDummy');

    await request(harness.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@gart.fit', password: validRegistration.password })
      .expect(401);

    expect(verifyDummy).toHaveBeenCalledTimes(1);
    verifyDummy.mockRestore();
  });

  it('rejects a malformed email before touching credentials', async () => {
    await request(harness.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: validRegistration.password })
      .expect(400);
  });
});
