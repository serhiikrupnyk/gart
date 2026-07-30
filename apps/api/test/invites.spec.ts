import request from 'supertest';

import {
  createClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  setCookieHeader,
  tokenFromInviteUrl,
} from './app-harness';

const NEW_PASSWORD = 'client-password-1';
const UNUSABLE_MESSAGE = 'Це запрошення недійсне або вже використане';

describe('client invites', () => {
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
    cookie = await registerTrainer(harness);
  });

  function accept(token: string, password = NEW_PASSWORD) {
    return request(harness.app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token, password });
  }

  describe('GET /invites/:token', () => {
    it('shows who invited whom, and nothing else', async () => {
      const { token } = await createClient(harness, cookie);

      const response = await request(harness.app.getHttpServer())
        .get(`/invites/${token}`)
        .expect(200);

      expect(response.body).toEqual({
        trainerName: 'Олена Ковальчук',
        clientFullName: 'Марія Бондаренко',
      });
      // The public page must not learn the client's address or any identifier.
      expect(JSON.stringify(response.body)).not.toContain('maria@example.com');
    });

    it('returns 404 for an unknown token', async () => {
      await request(harness.app.getHttpServer()).get('/invites/not-a-real-token').expect(404);
    });

    it('returns 410 once the invite has expired', async () => {
      const { token } = await createClient(harness, cookie);

      await harness.prisma.clientInvite.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await request(harness.app.getHttpServer()).get(`/invites/${token}`).expect(410);
    });

    it('makes an accepted invite look like one that never existed', async () => {
      const { token } = await createClient(harness, cookie);
      await accept(token).expect(204);

      // 404, not 410: a used token reveals strictly less this way.
      await request(harness.app.getHttpServer()).get(`/invites/${token}`).expect(404);
    });
  });

  describe('POST /auth/accept-invite', () => {
    it('creates the account, links the client and starts a session', async () => {
      const { client, token } = await createClient(harness, cookie);

      const response = await accept(token).expect(204);

      const setCookie = setCookieHeader(response.headers);
      expect(setCookie).toContain('gart_session=');
      expect(setCookie).toContain('HttpOnly');

      const stored = await harness.prisma.client.findUniqueOrThrow({ where: { id: client.id } });
      expect(stored.status).toBe('ACTIVE');
      expect(stored.userId).not.toBeNull();

      const user = await harness.prisma.user.findUniqueOrThrow({
        where: { email: 'maria@example.com' },
      });
      expect(user.id).toBe(stored.userId);
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);

      const invite = await harness.prisma.clientInvite.findFirstOrThrow({
        where: { clientId: client.id },
      });
      expect(invite.acceptedAt).not.toBeNull();
    });

    it('cannot be used twice', async () => {
      const { token } = await createClient(harness, cookie);
      await accept(token).expect(204);

      const second = await accept(token).expect(401);

      expect(second.body).toMatchObject({ message: UNUSABLE_MESSAGE });
      expect(await harness.prisma.user.count()).toBe(2);
    });

    it('rejects an expired invite', async () => {
      const { token } = await createClient(harness, cookie);

      await harness.prisma.clientInvite.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const response = await accept(token).expect(401);

      expect(response.body).toMatchObject({ message: UNUSABLE_MESSAGE });
      expect(await harness.prisma.user.count()).toBe(1);
    });

    it('answers an unknown token exactly as it answers a used one', async () => {
      const { token } = await createClient(harness, cookie);
      await accept(token).expect(204);

      const used = await accept(token).expect(401);
      const unknown = await accept('completely-made-up-token').expect(401);

      expect(used.body).toEqual(unknown.body);
    });

    it('refuses when the email already has an account, without touching it', async () => {
      // The trainer invites an address that already belongs to someone. Linking
      // here would let an invite overwrite that account's password.
      const { token } = await createClient(harness, cookie, { email: 'trainer@gart.fit' });

      const before = await harness.prisma.user.findUniqueOrThrow({
        where: { email: 'trainer@gart.fit' },
      });

      const response = await accept(token).expect(401);

      const after = await harness.prisma.user.findUniqueOrThrow({
        where: { email: 'trainer@gart.fit' },
      });

      expect(response.body).toMatchObject({ message: UNUSABLE_MESSAGE });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(await harness.prisma.user.count()).toBe(1);
    });

    it('rolls back completely when linking the client fails', async () => {
      const { client, token } = await createClient(harness, cookie);

      await harness.prisma.$executeRawUnsafe(
        'ALTER TABLE "Client" ADD CONSTRAINT "tmp_force_failure" CHECK (status <> \'ACTIVE\') NOT VALID',
      );

      try {
        await accept(token).expect(500);

        // No orphan account, and the invite is still usable afterwards.
        expect(await harness.prisma.user.count()).toBe(1);
        const stored = await harness.prisma.client.findUniqueOrThrow({ where: { id: client.id } });
        expect(stored.status).toBe('INVITED');
        expect(stored.userId).toBeNull();
        const invite = await harness.prisma.clientInvite.findFirstOrThrow({
          where: { clientId: client.id },
        });
        expect(invite.acceptedAt).toBeNull();
      } finally {
        await harness.prisma.$executeRawUnsafe(
          'ALTER TABLE "Client" DROP CONSTRAINT "tmp_force_failure"',
        );
      }
    });

    it('requires a password of at least eight characters', async () => {
      const { token } = await createClient(harness, cookie);

      await accept(token, 'short').expect(400);
      expect(await harness.prisma.user.count()).toBe(1);
    });

    it('returns no body at all, so nothing can leak', async () => {
      const { token } = await createClient(harness, cookie);

      const response = await accept(token).expect(204);

      expect(response.text).toBe('');
    });
  });

  describe('POST /clients/:id/invite', () => {
    it('invalidates the previous link and issues a working one', async () => {
      const { client, token: originalToken } = await createClient(harness, cookie);

      const response = await request(harness.app.getHttpServer())
        .post(`/clients/${client.id}/invite`)
        .set('Cookie', cookie)
        .expect(201);

      const freshToken = tokenFromInviteUrl((response.body as { inviteUrl: string }).inviteUrl);

      expect(freshToken).not.toBe(originalToken);
      await request(harness.app.getHttpServer()).get(`/invites/${originalToken}`).expect(404);
      await request(harness.app.getHttpServer()).get(`/invites/${freshToken}`).expect(200);

      // The superseded row is gone rather than lingering unusable.
      expect(await harness.prisma.clientInvite.count({ where: { clientId: client.id } })).toBe(1);
    });

    it('refuses once the client has accepted', async () => {
      const { client, token } = await createClient(harness, cookie);
      await accept(token).expect(204);

      const response = await request(harness.app.getHttpServer())
        .post(`/clients/${client.id}/invite`)
        .set('Cookie', cookie)
        .expect(409);

      expect(response.body).toMatchObject({ message: 'Клієнт уже прийняв запрошення' });
    });
  });
});
