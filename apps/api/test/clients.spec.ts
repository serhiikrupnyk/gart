import request from 'supertest';

import { hashToken } from '../src/common/token';
import {
  createClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
} from './app-harness';

describe('client management', () => {
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

  it('creates an invited client and returns a one-time link', async () => {
    const { client, inviteUrl } = await createClient(harness, cookie);

    expect(client).toMatchObject({
      fullName: 'Марія Бондаренко',
      email: 'maria@example.com',
      status: 'INVITED',
    });
    expect(inviteUrl).toMatch(/^http:\/\/localhost:3000\/invite\/[A-Za-z0-9_-]{20,}$/);
  });

  it('stores only the hash of the invite token, never the token', async () => {
    const { token } = await createClient(harness, cookie);

    const invite = await harness.prisma.clientInvite.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });

    expect(invite.tokenHash).toBe(hashToken(token));
    // Nothing anywhere in the row is the raw token.
    expect(JSON.stringify(invite)).not.toContain(token);
  });

  it('never echoes the tenant id back to the trainer', async () => {
    const { client } = await createClient(harness, cookie);

    expect(client).not.toHaveProperty('trainerId');
    expect(client).not.toHaveProperty('userId');
  });

  it('lowercases the client email', async () => {
    const { client } = await createClient(harness, cookie, { email: 'MARIA@Example.COM' });

    expect(client.email).toBe('maria@example.com');
  });

  it('rejects a second client with the same email', async () => {
    await createClient(harness, cookie);

    const response = await request(harness.app.getHttpServer())
      .post('/clients')
      .set('Cookie', cookie)
      .send({ fullName: 'Інша Марія', email: 'MARIA@example.com' })
      .expect(409);

    expect(response.body).toMatchObject({
      message: 'Клієнт із цим email вже є у вашому списку',
    });
    expect(await harness.prisma.client.count()).toBe(1);
  });

  it('points the trainer at the archive when the email is already there', async () => {
    const { client } = await createClient(harness, cookie);

    await request(harness.app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Cookie', cookie)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    const response = await request(harness.app.getHttpServer())
      .post('/clients')
      .set('Cookie', cookie)
      .send({ fullName: 'Марія Бондаренко', email: 'maria@example.com' })
      .expect(409);

    expect(response.body).toMatchObject({
      message: 'Клієнт із цим email є у вашому архіві — відновіть його',
    });
  });

  it('filters the list by status', async () => {
    const { client } = await createClient(harness, cookie);
    await createClient(harness, cookie, { fullName: 'Друга', email: 'second@example.com' });

    await request(harness.app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Cookie', cookie)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    const invited = await request(harness.app.getHttpServer())
      .get('/clients?status=INVITED')
      .set('Cookie', cookie)
      .expect(200);

    const archived = await request(harness.app.getHttpServer())
      .get('/clients?status=ARCHIVED')
      .set('Cookie', cookie)
      .expect(200);

    expect(invited.body).toHaveLength(1);
    expect(archived.body).toMatchObject([{ id: client.id }]);
  });

  it('renames a client', async () => {
    const { client } = await createClient(harness, cookie);

    const response = await request(harness.app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Cookie', cookie)
      .send({ fullName: '  Марія Б.  ' })
      .expect(200);

    expect(response.body).toMatchObject({ fullName: 'Марія Б.' });
  });

  it('refuses to mark a client active before they have an account', async () => {
    const { client } = await createClient(harness, cookie);

    const response = await request(harness.app.getHttpServer())
      .patch(`/clients/${client.id}`)
      .set('Cookie', cookie)
      .send({ status: 'ACTIVE' })
      .expect(400);

    expect(response.body).toMatchObject({ message: 'Клієнт ще не прийняв запрошення' });
  });

  describe('validation', () => {
    it.each([
      ['a malformed email', { fullName: 'Марія', email: 'not-an-email' }],
      ['a blank name', { fullName: '   ', email: 'ok@example.com' }],
      ['an unknown property', { fullName: 'Марія', email: 'ok@example.com', trainerId: 'x' }],
    ])('rejects %s', async (_label, payload) => {
      await request(harness.app.getHttpServer())
        .post('/clients')
        .set('Cookie', cookie)
        .send(payload)
        .expect(400);

      expect(await harness.prisma.client.count()).toBe(0);
    });

    it('rejects an unknown status filter', async () => {
      await request(harness.app.getHttpServer())
        .get('/clients?status=NONSENSE')
        .set('Cookie', cookie)
        .expect(400);
    });
  });
});
