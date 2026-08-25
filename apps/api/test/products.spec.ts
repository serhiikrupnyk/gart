import request from 'supertest';
import { PRODUCT_PRICE_MAX } from '@gart/shared';

import {
  createAcceptedClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
} from './app-harness';

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
  harness.payments.outcome = 'SUCCEEDED';
});

const ONE_TIME = { name: 'Разовий блок', kind: 'ONE_TIME', price: '1500.00', accessDays: 30 };
const SUBSCRIPTION = { name: 'Супровід', kind: 'SUBSCRIPTION', price: '900.00', period: 'MONTHLY' };

function create(cookie: string, body: unknown): request.Test {
  return request(harness.app.getHttpServer())
    .post('/products')
    .set('Cookie', cookie)
    .send(body as object);
}

describe('creating a product', () => {
  it('stores a one-time product with a bounded access window', async () => {
    const cookie = await registerTrainer(harness);

    const response = await create(cookie, ONE_TIME).expect(201);

    expect(response.body).toMatchObject({
      name: 'Разовий блок',
      kind: 'ONE_TIME',
      period: null,
      accessDays: 30,
      price: { amount: '1500.00', currency: 'UAH' },
      isActive: true,
    });
  });

  it('stores a one-time product that never lapses', async () => {
    const cookie = await registerTrainer(harness);

    const response = await create(cookie, { ...ONE_TIME, accessDays: undefined }).expect(201);

    expect(response.body.accessDays).toBeNull();
  });

  it('stores a subscription for every period the roadmap names', async () => {
    const cookie = await registerTrainer(harness);

    for (const period of ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']) {
      const response = await create(cookie, {
        ...SUBSCRIPTION,
        name: `Супровід ${period}`,
        period,
      }).expect(201);

      expect(response.body).toMatchObject({ kind: 'SUBSCRIPTION', period, accessDays: null });
    }
  });

  it('keeps decimal precision exactly, with no float on the way in', async () => {
    const cookie = await registerTrainer(harness);

    const response = await create(cookie, { ...ONE_TIME, price: '1234.56' }).expect(201);

    expect(response.body.price.amount).toBe('1234.56');

    const stored = await harness.prisma.product.findFirstOrThrow();
    expect(stored.priceAmount.toFixed(2)).toBe('1234.56');
  });
});

describe('the kind rules', () => {
  it('refuses a subscription with no period', async () => {
    const cookie = await registerTrainer(harness);

    await create(cookie, { ...SUBSCRIPTION, period: undefined }).expect(400);

    expect(await harness.prisma.product.count()).toBe(0);
  });

  it('refuses a subscription that also expires after a number of days', async () => {
    const cookie = await registerTrainer(harness);

    await create(cookie, { ...SUBSCRIPTION, accessDays: 30 }).expect(400);

    expect(await harness.prisma.product.count()).toBe(0);
  });

  it('refuses a one-time product with a period', async () => {
    const cookie = await registerTrainer(harness);

    await create(cookie, { ...ONE_TIME, period: 'MONTHLY' }).expect(400);

    expect(await harness.prisma.product.count()).toBe(0);
  });

  it('refuses a kind or period it does not recognise', async () => {
    const cookie = await registerTrainer(harness);

    await create(cookie, { ...ONE_TIME, kind: 'LIFETIME' }).expect(400);
    await create(cookie, { ...SUBSCRIPTION, period: 'WEEKLY' }).expect(400);

    expect(await harness.prisma.product.count()).toBe(0);
  });

  it('refuses an access window outside the sane range', async () => {
    const cookie = await registerTrainer(harness);

    for (const accessDays of [0, -1, 3651, 1.5]) {
      await create(cookie, { ...ONE_TIME, accessDays }).expect(400);
    }

    expect(await harness.prisma.product.count()).toBe(0);
  });
});

describe('price validation', () => {
  it('refuses a price that is not money', async () => {
    const cookie = await registerTrainer(harness);

    for (const price of ['0', '0.00', '-100.00', '1500.005', 'безкоштовно', '', '1e3', ' 100']) {
      await create(cookie, { ...ONE_TIME, price }).expect(400);
    }

    expect(await harness.prisma.product.count()).toBe(0);
  });

  it('refuses a price outside the bounds a real product has', async () => {
    const cookie = await registerTrainer(harness);

    await create(cookie, { ...ONE_TIME, price: '0.99' }).expect(400);
    await create(cookie, { ...ONE_TIME, price: String(PRODUCT_PRICE_MAX + 1) }).expect(400);

    // The bounds themselves are inclusive.
    await create(cookie, { ...ONE_TIME, price: '1.00' }).expect(201);
    await create(cookie, { ...ONE_TIME, price: `${String(PRODUCT_PRICE_MAX)}.00` }).expect(201);
  });

  it('refuses a request that tries to choose its own currency', async () => {
    const cookie = await registerTrainer(harness);

    await create(cookie, { ...ONE_TIME, currency: 'USD' }).expect(400);

    expect(await harness.prisma.product.count()).toBe(0);
  });

  it('refuses a price sent as a number rather than a decimal string', async () => {
    const cookie = await registerTrainer(harness);

    // A JSON number has already been through a float by the time it arrives.
    await create(cookie, { ...ONE_TIME, price: 1500 }).expect(400);

    expect(await harness.prisma.product.count()).toBe(0);
  });
});

describe('reading and updating', () => {
  it('lists the trainer their own catalogue, active first', async () => {
    const cookie = await registerTrainer(harness);

    const first = await create(cookie, ONE_TIME).expect(201);
    await create(cookie, { ...SUBSCRIPTION, name: 'Другий' }).expect(201);

    await request(harness.app.getHttpServer())
      .patch(`/products/${String(first.body.id)}`)
      .set('Cookie', cookie)
      .send({ isActive: false })
      .expect(200);

    const list = await request(harness.app.getHttpServer())
      .get('/products')
      .set('Cookie', cookie)
      .expect(200);

    expect(list.body).toHaveLength(2);
    expect(list.body[0].isActive).toBe(true);
    expect(list.body[1].isActive).toBe(false);
  });

  it('filters by status', async () => {
    const cookie = await registerTrainer(harness);
    const created = await create(cookie, ONE_TIME).expect(201);

    await request(harness.app.getHttpServer())
      .patch(`/products/${String(created.body.id)}`)
      .set('Cookie', cookie)
      .send({ isActive: false })
      .expect(200);

    const active = await request(harness.app.getHttpServer())
      .get('/products?status=active')
      .set('Cookie', cookie)
      .expect(200);
    expect(active.body).toEqual([]);

    const inactive = await request(harness.app.getHttpServer())
      .get('/products?status=inactive')
      .set('Cookie', cookie)
      .expect(200);
    expect(inactive.body).toHaveLength(1);
  });

  it('judges a patch against the merged product, not the patch alone', async () => {
    const cookie = await registerTrainer(harness);
    const created = await create(cookie, ONE_TIME).expect(201);
    const id = String(created.body.id);

    // ONE_TIME with accessDays 30 → SUBSCRIPTION alone would be incoherent,
    // because the stored accessDays would survive the change.
    await request(harness.app.getHttpServer())
      .patch(`/products/${id}`)
      .set('Cookie', cookie)
      .send({ kind: 'SUBSCRIPTION', period: 'MONTHLY' })
      .expect(400);

    // Clearing the days in the same breath is coherent, and allowed.
    const fixed = await request(harness.app.getHttpServer())
      .patch(`/products/${id}`)
      .set('Cookie', cookie)
      .send({ kind: 'SUBSCRIPTION', period: 'MONTHLY', accessDays: null })
      .expect(200);

    expect(fixed.body).toMatchObject({
      kind: 'SUBSCRIPTION',
      period: 'MONTHLY',
      accessDays: null,
    });
  });

  it('drops the period when a subscription becomes a one-time product', async () => {
    const cookie = await registerTrainer(harness);
    const created = await create(cookie, SUBSCRIPTION).expect(201);

    const updated = await request(harness.app.getHttpServer())
      .patch(`/products/${String(created.body.id)}`)
      .set('Cookie', cookie)
      .send({ kind: 'ONE_TIME', period: null, accessDays: 90 })
      .expect(200);

    expect(updated.body).toMatchObject({ kind: 'ONE_TIME', period: null, accessDays: 90 });
  });

  it('round-trips a price through an update without losing precision', async () => {
    const cookie = await registerTrainer(harness);
    const created = await create(cookie, ONE_TIME).expect(201);

    const updated = await request(harness.app.getHttpServer())
      .patch(`/products/${String(created.body.id)}`)
      .set('Cookie', cookie)
      .send({ price: '2345.67' })
      .expect(200);

    expect(updated.body.price.amount).toBe('2345.67');
  });
});

describe('tenant isolation', () => {
  it("does not reveal another trainer's product, and says only 404", async () => {
    const owner = await registerTrainer(harness);
    const created = await create(owner, ONE_TIME).expect(201);
    const id = String(created.body.id);

    const intruder = await registerTrainer(harness, secondRegistration);
    const server = harness.app.getHttpServer();

    const trespass = await request(server)
      .get(`/products/${id}`)
      .set('Cookie', intruder)
      .expect(404);
    const absent = await request(server)
      .get('/products/ckdoesnotexist000000000')
      .set('Cookie', intruder)
      .expect(404);

    expect(trespass.body).toEqual(absent.body);

    // Every mutating route answers the same way.
    await request(server)
      .patch(`/products/${id}`)
      .set('Cookie', intruder)
      .send({ name: 'Викрадено' })
      .expect(404);
    await request(server).delete(`/products/${id}`).set('Cookie', intruder).expect(404);

    // And nothing happened to it.
    const still = await request(server).get(`/products/${id}`).set('Cookie', owner).expect(200);
    expect(still.body.name).toBe('Разовий блок');
  });

  it("keeps a trainer's list to their own catalogue", async () => {
    const owner = await registerTrainer(harness);
    await create(owner, ONE_TIME).expect(201);

    const intruder = await registerTrainer(harness, secondRegistration);
    const list = await request(harness.app.getHttpServer())
      .get('/products')
      .set('Cookie', intruder)
      .expect(200);

    expect(list.body).toEqual([]);
  });

  it('is closed to a client session entirely', async () => {
    const trainer = await registerTrainer(harness);
    const { clientCookie } = await createAcceptedClient(harness, trainer);
    const created = await create(trainer, ONE_TIME).expect(201);

    const server = harness.app.getHttpServer();
    await request(server).get('/products').set('Cookie', clientCookie).expect(401);
    await request(server)
      .get(`/products/${String(created.body.id)}`)
      .set('Cookie', clientCookie)
      .expect(401);
    await request(server).post('/products').set('Cookie', clientCookie).send(ONE_TIME).expect(401);
  });

  it('is closed to no session at all', async () => {
    await request(harness.app.getHttpServer()).get('/products').expect(401);
  });
});
