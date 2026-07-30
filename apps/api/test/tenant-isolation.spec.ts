import request from 'supertest';

import {
  createClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
  validRegistration,
} from './app-harness';

const NONEXISTENT_ID = 'cl00000000000000000000000';

/**
 * The property that matters most in a multitenant product: one trainer's data is
 * not merely hidden from another, it is indistinguishable from data that does
 * not exist. Every assertion here compares against a nonexistent id rather than
 * just checking a status code, because a 403 or a differently-shaped 404 would
 * still confirm the record is real.
 */
describe('tenant isolation', () => {
  let harness: Harness;
  let ownerCookie: string;
  let intruderCookie: string;
  let clientId: string;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    ownerCookie = await registerTrainer(harness, validRegistration);
    intruderCookie = await registerTrainer(harness, secondRegistration);
    clientId = (await createClient(harness, ownerCookie)).client.id;
  });

  it("hides another trainer's client behind an ordinary 404", async () => {
    const foreign = await request(harness.app.getHttpServer())
      .get(`/clients/${clientId}`)
      .set('Cookie', intruderCookie)
      .expect(404);

    const missing = await request(harness.app.getHttpServer())
      .get(`/clients/${NONEXISTENT_ID}`)
      .set('Cookie', intruderCookie)
      .expect(404);

    expect(foreign.body).toEqual(missing.body);
  });

  it("refuses to patch another trainer's client and leaves it untouched", async () => {
    await request(harness.app.getHttpServer())
      .patch(`/clients/${clientId}`)
      .set('Cookie', intruderCookie)
      .send({ fullName: 'Викрадено', status: 'ARCHIVED' })
      .expect(404);

    const untouched = await harness.prisma.client.findUniqueOrThrow({ where: { id: clientId } });

    expect(untouched.fullName).toBe('Марія Бондаренко');
    expect(untouched.status).toBe('INVITED');
  });

  it("refuses to regenerate an invite for another trainer's client", async () => {
    await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/invite`)
      .set('Cookie', intruderCookie)
      .expect(404);

    // No extra invite was minted for a tenant that does not own the client.
    expect(await harness.prisma.clientInvite.count({ where: { clientId } })).toBe(1);
  });

  it('lists only the calling trainer’s clients', async () => {
    await createClient(harness, intruderCookie, {
      fullName: 'Чужий Клієнт',
      email: 'intruder-client@example.com',
    });

    const owned = await request(harness.app.getHttpServer())
      .get('/clients')
      .set('Cookie', ownerCookie)
      .expect(200);

    expect(owned.body).toHaveLength(1);
    expect(owned.body).toMatchObject([{ id: clientId }]);
  });

  it('lets two trainers hold the same client email', async () => {
    // A person may be coached by more than one trainer; uniqueness is per tenant.
    await createClient(harness, intruderCookie, { email: 'maria@example.com' });

    expect(await harness.prisma.client.count({ where: { email: 'maria@example.com' } })).toBe(2);
  });

  describe.each([
    ['GET', '/clients'],
    ['POST', '/clients'],
  ])('%s %s', (method, path) => {
    it('rejects an unauthenticated caller', async () => {
      const server = harness.app.getHttpServer();
      const call = method === 'GET' ? request(server).get(path) : request(server).post(path);

      await call.send({}).expect(401);
    });
  });

  it('rejects unauthenticated access to a single client', async () => {
    await request(harness.app.getHttpServer()).get(`/clients/${clientId}`).expect(401);
    await request(harness.app.getHttpServer()).patch(`/clients/${clientId}`).send({}).expect(401);
    await request(harness.app.getHttpServer()).post(`/clients/${clientId}/invite`).expect(401);
  });
});
