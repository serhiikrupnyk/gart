import request from 'supertest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  createAcceptedClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
  validRegistration,
} from './app-harness';

let harness: Harness;

beforeAll(async () => {
  // Each test here registers a trainer, and the credential budget is 10/min.
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

async function productFor(email: string): Promise<string> {
  const user = await harness.prisma.user.findFirstOrThrow({
    where: { email },
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

  return product.id;
}

describe('payment tenant isolation', () => {
  it("refuses a checkout for another trainer's client, and says only 404", async () => {
    const first = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, first);

    const second = await registerTrainer(harness, secondRegistration);
    const intruderProduct = await productFor(secondRegistration.email);

    const trespass = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', second)
      .send({ productId: intruderProduct })
      .expect(404);

    const absent = await request(harness.app.getHttpServer())
      .post('/clients/ckdoesnotexist000000000/payments')
      .set('Cookie', second)
      .send({ productId: intruderProduct })
      .expect(404);

    // Identical answers: an intruder cannot tell a real client from a fiction.
    expect(trespass.body).toEqual(absent.body);
    expect(await harness.prisma.payment.count()).toBe(0);
  });

  it("refuses another trainer's product even for one's own client", async () => {
    await registerTrainer(harness);
    const firstProduct = await productFor(validRegistration.email);

    const second = await registerTrainer(harness, secondRegistration);
    const { clientId: ownClient } = await createAcceptedClient(harness, second, {
      email: 'other-client@example.com',
    });

    await request(harness.app.getHttpServer())
      .post(`/clients/${ownClient}/payments`)
      .set('Cookie', second)
      .send({ productId: firstProduct })
      .expect(404);

    expect(await harness.prisma.payment.count()).toBe(0);
  });

  it("does not list or reveal another trainer's payments", async () => {
    const first = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, first);
    const product = await productFor(validRegistration.email);

    const created = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', first)
      .send({ productId: product })
      .expect(201);

    const paymentId: string = created.body.payment.id;
    const second = await registerTrainer(harness, secondRegistration);

    const trespass = await request(harness.app.getHttpServer())
      .get(`/payments/${paymentId}`)
      .set('Cookie', second)
      .expect(404);

    const absent = await request(harness.app.getHttpServer())
      .get('/payments/ckdoesnotexist000000000')
      .set('Cookie', second)
      .expect(404);

    expect(trespass.body).toEqual(absent.body);

    // The owner still sees it, so the 404 was about tenancy, not about the row.
    await request(harness.app.getHttpServer())
      .get(`/payments/${paymentId}`)
      .set('Cookie', first)
      .expect(200);
  });

  it("shows a client their own entitlements and nobody else's", async () => {
    const trainer = await registerTrainer(harness);
    const product = await productFor(validRegistration.email);

    const buyer = await createAcceptedClient(harness, trainer);
    const sibling = await createAcceptedClient(harness, trainer, {
      fullName: 'Інший Клієнт',
      email: 'sibling@example.com',
    });

    await request(harness.app.getHttpServer())
      .post(`/clients/${buyer.clientId}/payments`)
      .set('Cookie', trainer)
      .send({ productId: product })
      .expect(201);

    const mine = await request(harness.app.getHttpServer())
      .get('/me/entitlements')
      .set('Cookie', buyer.clientCookie)
      .expect(200);

    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].isActive).toBe(true);

    // A sibling of the same trainer is as far away as a stranger.
    const theirs = await request(harness.app.getHttpServer())
      .get('/me/entitlements')
      .set('Cookie', sibling.clientCookie)
      .expect(200);

    expect(theirs.body).toEqual([]);
  });

  it('keeps the trainer app and the client app apart', async () => {
    const trainer = await registerTrainer(harness);
    const { clientCookie, clientId } = await createAcceptedClient(harness, trainer);
    const product = await productFor(validRegistration.email);

    // A client session cannot open a checkout: that is the trainer's act.
    await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', clientCookie)
      .send({ productId: product })
      .expect(401);

    // And a trainer session cannot read the client's entitlement list.
    await request(harness.app.getHttpServer())
      .get('/me/entitlements')
      .set('Cookie', trainer)
      .expect(401);
  });
});
