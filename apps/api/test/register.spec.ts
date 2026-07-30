import request from 'supertest';

import {
  createHarness,
  type Harness,
  resetDatabase,
  setCookieHeader,
  sessionCookie,
  validRegistration,
} from './app-harness';

describe('POST /auth/register', () => {
  let harness: Harness;

  beforeAll(async () => {
    // High enough that the throttler never interferes; the limit itself is
    // proven in rate-limit.spec.ts.
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
  });

  it('creates the account and starts a session', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/auth/register')
      .send(validRegistration)
      .expect(201);

    expect(response.body).toMatchObject({
      user: { email: validRegistration.email, name: validRegistration.displayName },
      trainer: { displayName: validRegistration.displayName },
    });

    const cookie = sessionCookie(response.headers as Record<string, unknown>);
    expect(cookie).toMatch(/^gart_session=.+/);

    const setCookie = setCookieHeader(response.headers);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('creates exactly one user and one trainer', async () => {
    await request(harness.app.getHttpServer())
      .post('/auth/register')
      .send(validRegistration)
      .expect(201);

    expect(await harness.prisma.user.count()).toBe(1);
    expect(await harness.prisma.trainer.count()).toBe(1);
  });

  it('makes the registering user the OWNER of the new tenant', async () => {
    await request(harness.app.getHttpServer())
      .post('/auth/register')
      .send(validRegistration)
      .expect(201);

    const members = await harness.prisma.teamMember.findMany();
    const user = await harness.prisma.user.findUniqueOrThrow({
      where: { email: validRegistration.email },
    });
    const trainer = await harness.prisma.trainer.findUniqueOrThrow({
      where: { userId: user.id },
    });

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ role: 'OWNER', userId: user.id, trainerId: trainer.id });
  });

  it('stores an argon2id hash, never the password', async () => {
    await request(harness.app.getHttpServer())
      .post('/auth/register')
      .send(validRegistration)
      .expect(201);

    const user = await harness.prisma.user.findUniqueOrThrow({
      where: { email: validRegistration.email },
    });

    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(user.passwordHash).not.toContain(validRegistration.password);
  });

  it('rejects a duplicate email with a clear message', async () => {
    await request(harness.app.getHttpServer())
      .post('/auth/register')
      .send(validRegistration)
      .expect(201);

    const response = await request(harness.app.getHttpServer())
      .post('/auth/register')
      .send(validRegistration)
      .expect(409);

    expect(response.body).toMatchObject({ message: 'Цей email вже використовується' });
    expect(await harness.prisma.user.count()).toBe(1);
  });

  it('treats email as case-insensitive', async () => {
    await request(harness.app.getHttpServer())
      .post('/auth/register')
      .send(validRegistration)
      .expect(201);

    await request(harness.app.getHttpServer())
      .post('/auth/register')
      .send({ ...validRegistration, email: 'TRAINER@GART.FIT' })
      .expect(409);
  });

  it('rolls back the user when the trainer insert fails', async () => {
    // A constraint the trainer insert must violate, forcing the second statement
    // of the transaction to fail after the first has already succeeded.
    await harness.prisma.$executeRawUnsafe(
      'ALTER TABLE "Trainer" ADD CONSTRAINT "tmp_force_failure" CHECK (false) NOT VALID',
    );

    try {
      await request(harness.app.getHttpServer())
        .post('/auth/register')
        .send(validRegistration)
        .expect(500);

      // The user must not survive its trainer.
      expect(await harness.prisma.user.count()).toBe(0);
      expect(await harness.prisma.trainer.count()).toBe(0);
    } finally {
      await harness.prisma.$executeRawUnsafe(
        'ALTER TABLE "Trainer" DROP CONSTRAINT "tmp_force_failure"',
      );
    }
  });

  it('rolls back the user and trainer when the owner membership fails', async () => {
    // The membership is the last statement of the transaction, so this proves
    // the whole thing unwinds rather than just its tail.
    await harness.prisma.$executeRawUnsafe(
      'ALTER TABLE "TeamMember" ADD CONSTRAINT "tmp_force_failure" CHECK (false) NOT VALID',
    );

    try {
      await request(harness.app.getHttpServer())
        .post('/auth/register')
        .send(validRegistration)
        .expect(500);

      expect(await harness.prisma.user.count()).toBe(0);
      expect(await harness.prisma.trainer.count()).toBe(0);
      expect(await harness.prisma.teamMember.count()).toBe(0);
    } finally {
      await harness.prisma.$executeRawUnsafe(
        'ALTER TABLE "TeamMember" DROP CONSTRAINT "tmp_force_failure"',
      );
    }
  });

  describe('validation', () => {
    it.each([
      ['a malformed email', { ...validRegistration, email: 'not-an-email' }],
      ['a password under 8 characters', { ...validRegistration, password: 'short' }],
      ['a blank display name', { ...validRegistration, displayName: '   ' }],
      ['an unknown extra property', { ...validRegistration, role: 'admin' }],
    ])('rejects %s', async (_label, payload) => {
      await request(harness.app.getHttpServer()).post('/auth/register').send(payload).expect(400);

      expect(await harness.prisma.user.count()).toBe(0);
    });
  });
});
