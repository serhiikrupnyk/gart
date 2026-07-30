import request from 'supertest';

import { PasswordService } from '../src/auth/password.service';
import {
  CLIENT_PASSWORD,
  createAcceptedClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
  sessionCookie,
  setCookieHeader,
  validRegistration,
} from './app-harness';

const GENERIC_ERROR = 'Невірний email або пароль';
const CLIENT_EMAIL = 'maria@example.com';

describe('client authentication', () => {
  let harness: Harness;
  let trainerCookie: string;

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
    await createAcceptedClient(harness, trainerCookie);
  });

  function login(email: string, password = CLIENT_PASSWORD) {
    return request(harness.app.getHttpServer())
      .post('/auth/client/login')
      .send({ email, password });
  }

  describe('POST /auth/client/login', () => {
    it('signs a client in and starts a client-context session', async () => {
      const response = await login(CLIENT_EMAIL).expect(200);

      expect(response.body).toMatchObject({
        client: { email: CLIENT_EMAIL, fullName: 'Марія Бондаренко', status: 'ACTIVE' },
        trainer: { displayName: validRegistration.displayName },
      });

      const setCookie = setCookieHeader(response.headers);
      expect(setCookie).toContain('gart_session=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');

      const session = await harness.prisma.session.findFirstOrThrow({
        orderBy: { createdAt: 'desc' },
      });
      expect(session.context).toBe('CLIENT');
      expect(session.clientId).not.toBeNull();
    });

    it('returns the brand and only the brand of the trainer', async () => {
      await harness.prisma.trainer.updateMany({
        data: { brandName: 'Кузня', brandColor: '#F0512B', brandLogoUrl: 'https://x.test/l.png' },
      });

      const response = await login(CLIENT_EMAIL).expect(200);
      const trainer = (response.body as { trainer: Record<string, unknown> }).trainer;

      expect(trainer).toEqual({
        displayName: validRegistration.displayName,
        brandName: 'Кузня',
        brandColor: '#F0512B',
        brandLogoUrl: 'https://x.test/l.png',
      });
    });

    it('accepts a differently-cased email', async () => {
      await login('MARIA@Example.COM').expect(200);
    });

    it('answers a wrong password and an unknown email identically', async () => {
      const wrongPassword = await login(CLIENT_EMAIL, 'definitely-not-it').expect(401);
      const unknownEmail = await login('nobody@example.com').expect(401);

      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body).toMatchObject({ message: GENERIC_ERROR });
      expect(unknownEmail.headers['set-cookie']).toBeUndefined();
    });

    it('still runs a hash verification when no account matched', async () => {
      const passwords = harness.app.get(PasswordService);
      const verifyDummy = jest.spyOn(passwords, 'verifyDummy');

      await login('nobody@example.com').expect(401);

      expect(verifyDummy).toHaveBeenCalledTimes(1);
      verifyDummy.mockRestore();
    });

    it('gives a trainer-only account the same generic answer', async () => {
      // Correct email, correct password, no client profile: this door must not
      // reveal that the address belongs to a trainer.
      const trainerAttempt = await login(
        validRegistration.email,
        validRegistration.password,
      ).expect(401);
      const unknown = await login('nobody@example.com').expect(401);

      expect(trainerAttempt.body).toEqual(unknown.body);
    });

    it('refuses an archived client with the same generic answer', async () => {
      await harness.prisma.client.updateMany({ data: { status: 'ARCHIVED' } });

      const archived = await login(CLIENT_EMAIL).expect(401);
      const unknown = await login('nobody@example.com').expect(401);

      expect(archived.body).toEqual(unknown.body);
    });
  });

  describe('GET /auth/client/me', () => {
    it('returns the client profile and their trainer’s brand', async () => {
      const cookie = sessionCookie(
        (await login(CLIENT_EMAIL).expect(200)).headers as Record<string, unknown>,
      );

      const response = await request(harness.app.getHttpServer())
        .get('/auth/client/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body).toMatchObject({
        client: { email: CLIENT_EMAIL, status: 'ACTIVE' },
        trainer: { displayName: validRegistration.displayName },
      });
    });

    it('rejects a missing and a forged cookie alike', async () => {
      await request(harness.app.getHttpServer()).get('/auth/client/me').expect(401);
      await request(harness.app.getHttpServer())
        .get('/auth/client/me')
        .set('Cookie', 'gart_session=not-a-real-token')
        .expect(401);
    });

    it('cuts off a client the moment their trainer archives them', async () => {
      const cookie = sessionCookie(
        (await login(CLIENT_EMAIL).expect(200)).headers as Record<string, unknown>,
      );

      await harness.prisma.client.updateMany({ data: { status: 'ARCHIVED' } });

      // The session row still exists — archiving revokes access, not the row.
      await request(harness.app.getHttpServer())
        .get('/auth/client/me')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('is tenant-correct: each client sees their own trainer’s brand', async () => {
      await harness.prisma.trainer.updateMany({
        where: { displayName: validRegistration.displayName },
        data: { brandName: 'Перший бренд' },
      });

      const secondTrainerCookie = await registerTrainer(harness, secondRegistration);
      const second = await createAcceptedClient(harness, secondTrainerCookie, {
        fullName: 'Другий Клієнт',
        email: 'second-client@example.com',
      });
      await harness.prisma.trainer.updateMany({
        where: { displayName: secondRegistration.displayName },
        data: { brandName: 'Другий бренд' },
      });

      const first = await request(harness.app.getHttpServer())
        .get('/auth/client/me')
        .set(
          'Cookie',
          sessionCookie((await login(CLIENT_EMAIL).expect(200)).headers as Record<string, unknown>),
        )
        .expect(200);

      const other = await request(harness.app.getHttpServer())
        .get('/auth/client/me')
        .set('Cookie', second.clientCookie)
        .expect(200);

      expect(first.body).toMatchObject({ trainer: { brandName: 'Перший бренд' } });
      expect(other.body).toMatchObject({ trainer: { brandName: 'Другий бренд' } });
    });
  });

  describe('POST /auth/logout with a client session', () => {
    it('revokes the session; a replayed cookie is inert', async () => {
      const cookie = sessionCookie(
        (await login(CLIENT_EMAIL).expect(200)).headers as Record<string, unknown>,
      );

      const sessionsBefore = await harness.prisma.session.count({ where: { context: 'CLIENT' } });

      await request(harness.app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      expect(await harness.prisma.session.count({ where: { context: 'CLIENT' } })).toBe(
        sessionsBefore - 1,
      );
      await request(harness.app.getHttpServer())
        .get('/auth/client/me')
        .set('Cookie', cookie)
        .expect(401);
    });
  });
});
