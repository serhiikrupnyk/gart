import request from 'supertest';

import {
  createAcceptedClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
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

interface Sold {
  cookie: string;
  clientId: string;
  productId: string;
  paymentId: string;
}

/** A trainer, a client, a product, and one completed purchase of it. */
async function sell(overrides: Partial<typeof ONE_TIME> = {}): Promise<Sold> {
  const cookie = await registerTrainer(harness);
  const { clientId } = await createAcceptedClient(harness, cookie);

  const product = await request(harness.app.getHttpServer())
    .post('/products')
    .set('Cookie', cookie)
    .send({ ...ONE_TIME, ...overrides })
    .expect(201);

  const payment = await request(harness.app.getHttpServer())
    .post(`/clients/${clientId}/payments`)
    .set('Cookie', cookie)
    .send({ productId: String(product.body.id) })
    .expect(201);

  return {
    cookie,
    clientId,
    productId: String(product.body.id),
    paymentId: String(payment.body.payment.id),
  };
}

describe('retiring a product', () => {
  it('deactivating stops new sales without touching what was already sold', async () => {
    const { cookie, clientId, productId, paymentId } = await sell();

    await request(harness.app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ isActive: false })
      .expect(200);

    // No new checkout may open against it.
    await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(400);

    // The completed purchase is untouched, and so is the access it granted.
    const payment = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');
    expect(payment.amount.toFixed(2)).toBe('1500.00');

    const granted = await harness.prisma.entitlement.findFirstOrThrow();
    expect(granted.revokedAt).toBeNull();
    expect(granted.endsAt).not.toBeNull();
  });

  it('reactivating puts it back on sale', async () => {
    const { cookie, clientId, productId } = await sell();
    const server = harness.app.getHttpServer();

    await request(server)
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ isActive: false })
      .expect(200);
    await request(server)
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ isActive: true })
      .expect(200);

    await request(server)
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(201);
  });
});

describe('the delete contract', () => {
  it('removes a product that was never sold', async () => {
    const cookie = await registerTrainer(harness);
    const created = await request(harness.app.getHttpServer())
      .post('/products')
      .set('Cookie', cookie)
      .send(ONE_TIME)
      .expect(201);

    await request(harness.app.getHttpServer())
      .delete(`/products/${String(created.body.id)}`)
      .set('Cookie', cookie)
      .expect(204);

    expect(await harness.prisma.product.count()).toBe(0);
  });

  it('REFUSES to delete a product history refers to, and says why', async () => {
    const { cookie, productId, paymentId } = await sell();

    const refusal = await request(harness.app.getHttpServer())
      .delete(`/products/${productId}`)
      .set('Cookie', cookie)
      .expect(409);

    expect(String(refusal.body.message)).toContain('деактивувати');

    // Nothing was orphaned or corrupted by the attempt.
    expect(await harness.prisma.product.count()).toBe(1);
    const payment = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(payment.productId).toBe(productId);
    expect(await harness.prisma.entitlement.count()).toBe(1);
  });
});

describe('editing a product that has been sold', () => {
  it('never rewrites the amount a completed payment charged', async () => {
    const { cookie, productId, paymentId } = await sell();

    await request(harness.app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ price: '9000.00' })
      .expect(200);

    const payment = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(payment.amount.toFixed(2)).toBe('1500.00');
  });

  it('never shortens access that was already granted', async () => {
    const { cookie, productId } = await sell();

    const before = await harness.prisma.entitlement.findFirstOrThrow();

    await request(harness.app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ accessDays: 1 })
      .expect(200);

    const after = await harness.prisma.entitlement.findFirstOrThrow();
    expect(after.endsAt?.toISOString()).toBe(before.endsAt?.toISOString());
  });

  it('settles a payment still in flight on the terms it was BOUGHT under', async () => {
    harness.payments.outcome = 'PENDING';

    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const product = await request(harness.app.getHttpServer())
      .post('/products')
      .set('Cookie', cookie)
      .send({ ...ONE_TIME, accessDays: 30 })
      .expect(201);
    const productId = String(product.body.id);

    const opened = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(201);

    const paymentId = String(opened.body.payment.id);
    expect(await harness.prisma.entitlement.count()).toBe(0);

    // The trainer edits the catalogue while the client is on the hosted page.
    await request(harness.app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ accessDays: 1 })
      .expect(200);

    // Now the acquirer confirms the purchase that was opened before the edit.
    const issued = harness.payments.issuedFor(paymentId);
    const callback = harness.payments.buildCallback(
      issued?.providerRef ?? '',
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );

    await request(harness.app.getHttpServer())
      .post('/payments/callback/fake')
      .send(callback.body as object)
      .expect(204);

    const granted = await harness.prisma.entitlement.findFirstOrThrow();
    const days = Math.round(
      ((granted.endsAt?.getTime() ?? 0) - granted.startsAt.getTime()) / (24 * 60 * 60 * 1000),
    );

    // 30, the term on sale at checkout — not 1, the term by the time it settled.
    expect(days).toBe(30);
  });

  it('protects a PERPETUAL purchase, whose snapshot is legitimately empty', async () => {
    harness.payments.outcome = 'PENDING';

    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);

    // No accessDays and no period: access that never lapses. Both snapshot
    // columns are null — and null is the RIGHT answer here, not a missing one.
    const product = await request(harness.app.getHttpServer())
      .post('/products')
      .set('Cookie', cookie)
      .send({ name: 'Довічний доступ', kind: 'ONE_TIME', price: '1500.00' })
      .expect(201);
    const productId = String(product.body.id);

    const opened = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(201);
    const paymentId = String(opened.body.payment.id);

    // The trainer edits the product while the client is on the hosted page.
    await request(harness.app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ accessDays: 30 })
      .expect(200);

    const issued = harness.payments.issuedFor(paymentId);
    await request(harness.app.getHttpServer())
      .post('/payments/callback/fake')
      .send(
        harness.payments.buildCallback(
          issued?.providerRef ?? '',
          'SUCCEEDED',
          { amount: '1500.00', currency: 'UAH' },
          paymentId,
        ).body as object,
      )
      .expect(204);

    const granted = await harness.prisma.entitlement.findFirstOrThrow();

    // Perpetual, as sold. Reading the edited product would give 30 days.
    expect(granted.endsAt).toBeNull();
  });

  it('protects a perpetual purchase even when the product becomes a subscription', async () => {
    harness.payments.outcome = 'PENDING';

    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const product = await request(harness.app.getHttpServer())
      .post('/products')
      .set('Cookie', cookie)
      .send({ name: 'Довічний доступ', kind: 'ONE_TIME', price: '1500.00' })
      .expect(201);
    const productId = String(product.body.id);

    const opened = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(201);
    const paymentId = String(opened.body.payment.id);

    await request(harness.app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ kind: 'SUBSCRIPTION', period: 'MONTHLY', accessDays: null })
      .expect(200);

    const issued = harness.payments.issuedFor(paymentId);
    await request(harness.app.getHttpServer())
      .post('/payments/callback/fake')
      .send(
        harness.payments.buildCallback(
          issued?.providerRef ?? '',
          'SUCCEEDED',
          { amount: '1500.00', currency: 'UAH' },
          paymentId,
        ).body as object,
      )
      .expect(204);

    expect((await harness.prisma.entitlement.findFirstOrThrow()).endsAt).toBeNull();
  });

  it('keeps the name a payment was sold under when the product is renamed', async () => {
    const { cookie, clientId, productId } = await sell({ name: 'Місяць супроводу' });

    await request(harness.app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ name: 'Рік супроводу' })
      .expect(200);

    const payments = await request(harness.app.getHttpServer())
      .get(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .expect(200);

    // A financial record must not be rewritten by a catalogue edit.
    expect(payments.body[0].productName).toBe('Місяць супроводу');

    // And the catalogue itself did change — so this is the snapshot holding,
    // not the rename having failed.
    const product = await request(harness.app.getHttpServer())
      .get(`/products/${productId}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(product.body.name).toBe('Рік супроводу');
  });
});
