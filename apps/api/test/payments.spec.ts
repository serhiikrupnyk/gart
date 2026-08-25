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

/** A product belongs to a trainer. Its CRUD is Step 23; the model is not. */
async function createProduct(
  trainerId: string,
  overrides: Partial<{
    name: string;
    price: string;
    kind: 'ONE_TIME' | 'SUBSCRIPTION';
    period: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | null;
    accessDays: number | null;
    isActive: boolean;
  }> = {},
): Promise<string> {
  const product = await harness.prisma.product.create({
    data: {
      trainerId,
      name: overrides.name ?? 'Місячний супровід',
      kind: overrides.kind ?? 'ONE_TIME',
      period: overrides.period ?? null,
      priceAmount: new Prisma.Decimal(overrides.price ?? '1500.00'),
      currency: 'UAH',
      accessDays: overrides.accessDays === undefined ? 30 : overrides.accessDays,
      isActive: overrides.isActive ?? true,
    },
  });

  return product.id;
}

async function trainerId(email: string): Promise<string> {
  const user = await harness.prisma.user.findFirstOrThrow({
    where: { email },
    include: { trainer: true },
  });

  const id = user.trainer?.id;

  if (id === undefined) {
    throw new Error(`User ${email} has no trainer`);
  }

  return id;
}

describe('checkout', () => {
  it('computes the amount from the stored product, not the request', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const productId = await createProduct(await trainerId(validRegistration.email), {
      price: '1500.00',
    });

    const response = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(201);

    expect(response.body.payment.amount).toEqual({ amount: '1500.00', currency: 'UAH' });
  });

  it('rejects a request that tries to supply its own amount', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const productId = await createProduct(await trainerId(validRegistration.email), {
      price: '1500.00',
    });

    await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId, amount: '1.00' })
      .expect(400);

    // The decisive part: nothing was created at the price the caller proposed.
    expect(await harness.prisma.payment.count()).toBe(0);
  });

  it('preserves decimal precision exactly, with no float on the path', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const productId = await createProduct(await trainerId(validRegistration.email), {
      price: '1234.56',
    });

    const response = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(201);

    expect(response.body.payment.amount.amount).toBe('1234.56');

    const stored = await harness.prisma.payment.findFirstOrThrow();
    expect(stored.amount.toFixed(2)).toBe('1234.56');
  });

  it('refuses a product that is no longer sold', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const productId = await createProduct(await trainerId(validRegistration.email), {
      isActive: false,
    });

    await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(400);

    expect(await harness.prisma.payment.count()).toBe(0);
  });
});

describe('granting access', () => {
  it('grants exactly once when the provider confirms', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const productId = await createProduct(await trainerId(validRegistration.email), {
      accessDays: 30,
    });

    const response = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(201);

    expect(response.body.payment.status).toBe('SUCCEEDED');
    expect(response.body.payment.paidAt).not.toBeNull();

    const entitlements = await harness.prisma.entitlement.findMany();
    expect(entitlements).toHaveLength(1);
    expect(entitlements[0]?.clientId).toBe(clientId);
    expect(entitlements[0]?.paymentId).toBe(response.body.payment.id);

    // 30 days of access, measured from the grant rather than from the request.
    const granted = entitlements[0];
    const days =
      granted?.endsAt === null || granted?.endsAt === undefined
        ? null
        : Math.round(
            (granted.endsAt.getTime() - granted.startsAt.getTime()) / (24 * 60 * 60 * 1000),
          );
    expect(days).toBe(30);
  });

  it('grants a subscription to a month boundary, not to 30 days', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const productId = await createProduct(await trainerId(validRegistration.email), {
      kind: 'SUBSCRIPTION',
      period: 'QUARTERLY',
      accessDays: null,
    });

    await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(201);

    const granted = await harness.prisma.entitlement.findFirstOrThrow();
    const start = granted.startsAt;
    const end = granted.endsAt;

    expect(end).not.toBeNull();
    expect(end?.getUTCMonth()).toBe(
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1)).getUTCMonth(),
    );
  });

  it('grants perpetual access when the product never expires', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const productId = await createProduct(await trainerId(validRegistration.email), {
      accessDays: null,
    });

    await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(201);

    const granted = await harness.prisma.entitlement.findFirstOrThrow();
    expect(granted.endsAt).toBeNull();
  });

  it('grants nothing when the payment fails', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const productId = await createProduct(await trainerId(validRegistration.email));
    harness.payments.outcome = 'FAILED';

    const response = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(201);

    expect(response.body.payment.status).toBe('FAILED');
    expect(await harness.prisma.entitlement.count()).toBe(0);

    const stored = await harness.prisma.payment.findFirstOrThrow();
    expect(stored.failedAt).not.toBeNull();
    expect(stored.paidAt).toBeNull();
  });

  it('grants nothing while the payment is still pending', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);
    const productId = await createProduct(await trainerId(validRegistration.email));
    harness.payments.outcome = 'PENDING';

    const response = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(201);

    expect(response.body.payment.status).toBe('PENDING');
    expect(response.body.redirectUrl).not.toBeNull();
    expect(await harness.prisma.entitlement.count()).toBe(0);
    expect(await harness.prisma.paymentEvent.count()).toBe(0);
  });
});
