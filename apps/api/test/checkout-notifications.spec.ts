import request from 'supertest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  createAcceptedClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  validRegistration,
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
  harness.queue.reset();
});

interface Sale {
  cookie: string;
  clientCookie: string;
  clientId: string;
  paymentId: string;
  providerRef: string;
}

async function buy(): Promise<Sale> {
  const cookie = await registerTrainer(harness);
  const { clientId, clientCookie } = await createAcceptedClient(harness, cookie);
  const user = await harness.prisma.user.findFirstOrThrow({
    where: { email: validRegistration.email },
    include: { trainer: true },
  });

  const product = await harness.prisma.product.create({
    data: {
      trainerId: user.trainer?.id ?? '',
      name: 'Місячний супровід',
      kind: 'ONE_TIME',
      priceAmount: new Prisma.Decimal('1500.00'),
      currency: 'UAH',
      accessDays: 30,
    },
  });

  const response = await request(harness.app.getHttpServer())
    .post(`/clients/${clientId}/payments`)
    .set('Cookie', cookie)
    .send({ productId: product.id })
    .expect(201);

  const paymentId = String(response.body.payment.id);

  return {
    cookie,
    clientCookie,
    clientId,
    paymentId,
    providerRef: harness.payments.issuedFor(paymentId)?.providerRef ?? '',
  };
}

/** Notifications as rows, which is what both apps actually read. */
async function notifications(): Promise<{ audience: string; type: string; title: string }[]> {
  const rows = await harness.prisma.notification.findMany({ orderBy: { createdAt: 'asc' } });

  return rows.map((row) => ({ audience: row.audience, type: row.type, title: row.title }));
}

describe('a payment that succeeds', () => {
  it('tells both parties, once each', async () => {
    await buy();

    const sent = await notifications();

    expect(sent).toHaveLength(2);
    expect(sent.filter((n) => n.audience === 'TRAINER')).toHaveLength(1);
    expect(sent.filter((n) => n.audience === 'CLIENT')).toHaveLength(1);
    expect(sent.every((n) => n.type === 'PAYMENT_SUCCEEDED')).toBe(true);
  });

  it('never tells the client what the platform took', async () => {
    await buy();

    const rows = await harness.prisma.notification.findMany({ where: { audience: 'CLIENT' } });
    const text = rows.map((row) => `${row.title} ${row.body ?? ''}`).join(' ');

    expect(text).toContain('Місячний супровід');
    // The fee on ₴1500 at 5%.
    expect(text).not.toContain('75');
    expect(text).not.toContain('1425');
  });

  it('grants access exactly once, however many deliveries arrive', async () => {
    const { paymentId, providerRef } = await buy();

    expect(await harness.prisma.entitlement.count()).toBe(1);
    expect(await harness.prisma.notification.count()).toBe(2);

    // The same delivery again, and then a different delivery for the same
    // payment: neither may grant again, and neither may announce again.
    const delivered = await harness.prisma.paymentEvent.findFirstOrThrow();
    const replay = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
      { deliveryId: delivered.externalId },
    );
    const fresh = harness.payments.buildCallback(
      providerRef,
      'SUCCEEDED',
      { amount: '1500.00', currency: 'UAH' },
      paymentId,
    );

    const server = harness.app.getHttpServer();
    await request(server)
      .post('/payments/callback/fake')
      .send(replay.body as object)
      .expect(204);
    await request(server)
      .post('/payments/callback/fake')
      .send(fresh.body as object)
      .expect(204);

    expect(await harness.prisma.entitlement.count()).toBe(1);
    expect(await harness.prisma.notification.count()).toBe(2);
  });
});

describe('a refund', () => {
  it('tells both parties, because the client just lost what they bought', async () => {
    const { paymentId, providerRef } = await buy();
    expect(await harness.prisma.notification.count()).toBe(2);

    await request(harness.app.getHttpServer())
      .post('/payments/callback/fake')
      .send(
        harness.payments.buildCallback(
          providerRef,
          'REFUNDED',
          { amount: '1500.00', currency: 'UAH' },
          paymentId,
        ).body as object,
      )
      .expect(204);

    const sent = await notifications();
    const refunds = sent.filter((n) => n.type === 'PAYMENT_REFUNDED');

    expect(refunds).toHaveLength(2);
    expect(refunds.filter((n) => n.audience === 'CLIENT')).toHaveLength(1);
    expect(refunds.filter((n) => n.audience === 'TRAINER')).toHaveLength(1);

    // And the access really did end — the notification is not the only change.
    expect((await harness.prisma.entitlement.findFirstOrThrow()).revokedAt).not.toBeNull();
  });
});

describe('a payment that does not succeed', () => {
  it('tells both parties it failed, and grants nothing', async () => {
    harness.payments.outcome = 'FAILED';
    await buy();

    const sent = await notifications();

    expect(sent).toHaveLength(2);
    expect(sent.every((n) => n.type === 'PAYMENT_FAILED')).toBe(true);
    expect(await harness.prisma.entitlement.count()).toBe(0);
  });

  it('says nothing at all while it is merely pending', async () => {
    harness.payments.outcome = 'PENDING';
    await buy();

    // «Still waiting» is not news, and a checkout the client has not opened yet
    // has produced no event either party needs to hear about.
    expect(await notifications()).toEqual([]);
    expect(await harness.prisma.entitlement.count()).toBe(0);
  });

  it('announces the settlement when a pending payment later succeeds', async () => {
    harness.payments.outcome = 'PENDING';
    const { paymentId, providerRef } = await buy();

    expect(await harness.prisma.notification.count()).toBe(0);

    await request(harness.app.getHttpServer())
      .post('/payments/callback/fake')
      .send(
        harness.payments.buildCallback(
          providerRef,
          'SUCCEEDED',
          { amount: '1500.00', currency: 'UAH' },
          paymentId,
        ).body as object,
      )
      .expect(204);

    expect(await notifications()).toHaveLength(2);
    expect(await harness.prisma.entitlement.count()).toBe(1);
  });

  it('does not announce a delivery it refused as out of order', async () => {
    const { paymentId, providerRef } = await buy();
    expect(await harness.prisma.notification.count()).toBe(2);

    // A late PENDING cannot walk a paid payment back, and must not announce
    // anything either — the payment did not change.
    await request(harness.app.getHttpServer())
      .post('/payments/callback/fake')
      .send(
        harness.payments.buildCallback(
          providerRef,
          'PENDING',
          { amount: '1500.00', currency: 'UAH' },
          paymentId,
        ).body as object,
      )
      .expect(204);

    expect(await harness.prisma.notification.count()).toBe(2);
  });
});
