import request from 'supertest';
import { PRODUCT_PRICE_MAX } from '@gart/shared';

import { COMMISSION_PERCENT_ENV } from '../src/payments/commission';

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
  process.env.AUTH_THROTTLE_LIMIT = '1000';
  harness = await createHarness();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await resetDatabase(harness.prisma);
  harness.payments.outcome = 'SUCCEEDED';
  harness.queue.jobs.length = 0;
});

async function trainerIdFor(email: string): Promise<string> {
  const user = await harness.prisma.user.findFirstOrThrow({
    where: { email },
    include: { trainer: true },
  });

  return user.trainer?.id ?? '';
}

async function makeProduct(trainerId: string, price = '1500.00'): Promise<string> {
  const product = await harness.prisma.product.create({
    data: {
      trainerId,
      name: 'Місячний супровід',
      kind: 'ONE_TIME',
      priceAmount: new Prisma.Decimal(price),
      currency: 'UAH',
      accessDays: 30,
    },
  });

  return product.id;
}

interface Opened {
  cookie: string;
  clientId: string;
  clientCookie: string;
  productId: string;
  paymentId: string;
  body: Record<string, unknown>;
}

async function openCheckout(price = '1500.00'): Promise<Opened> {
  const cookie = await registerTrainer(harness);
  const { clientId, clientCookie } = await createAcceptedClient(harness, cookie);
  const productId = await makeProduct(await trainerIdFor(validRegistration.email), price);

  const response = await request(harness.app.getHttpServer())
    .post(`/clients/${clientId}/payments`)
    .set('Cookie', cookie)
    .send({ productId })
    .expect(201);

  return {
    cookie,
    clientId,
    clientCookie,
    productId,
    paymentId: String(response.body.payment.id),
    body: response.body as Record<string, unknown>,
  };
}

describe('the platform split', () => {
  it('computes the fee server-side and snapshots it on the payment', async () => {
    const { paymentId } = await openCheckout('1500.00');

    const payment = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });

    expect(payment.amount.toFixed(2)).toBe('1500.00');
    expect(payment.platformFee.toFixed(2)).toBe('75.00');
    expect(payment.amount.minus(payment.platformFee).toFixed(2)).toBe('1425.00');
  });

  it('hands the provider a split instruction carrying exactly that fee', async () => {
    const { paymentId } = await openCheckout('1500.00');

    // Asserted where the provider actually received it, not where we set it.
    const issued = harness.payments.issuedFor(paymentId);

    expect(issued?.split).toEqual({
      beneficiaryRef: await trainerIdFor(validRegistration.email),
      platformFee: { amount: '75.00', currency: 'UAH' },
    });
  });

  it('a later PRICE change does not rewrite what was already charged', async () => {
    const { paymentId, clientId, cookie, productId } = await openCheckout('1500.00');

    const before = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(before.platformFee.toFixed(2)).toBe('75.00');

    // The fee's SOURCE changes; the charged fee must not.
    await request(harness.app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('Cookie', cookie)
      .send({ price: '9000.00' })
      .expect(200);

    const after = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(after.platformFee.toFixed(2)).toBe('75.00');
    expect(after.amount.toFixed(2)).toBe('1500.00');

    // And the next checkout uses the new price, so the snapshot is a snapshot
    // rather than the system simply never changing.
    const next = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId })
      .expect(201);

    expect(next.body.payment.platformFee.amount).toBe('450.00');
  });

  it('applies a NEW RATE to new checkouts and to no old ones', async () => {
    const { paymentId, clientId, cookie, productId } = await openCheckout('1500.00');

    expect(
      (
        await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } })
      ).platformFee.toFixed(2),
    ).toBe('75.00');

    // The rate is read once, when the service is constructed, so raising it
    // means a new application — which is how it would reach production too.
    process.env[COMMISSION_PERCENT_ENV] = '10';
    const raised = await createHarness();

    try {
      const next = await request(raised.app.getHttpServer())
        .post(`/clients/${clientId}/payments`)
        .set('Cookie', cookie)
        .send({ productId })
        .expect(201);

      // The new checkout is charged at ten percent...
      expect(next.body.payment.platformFee.amount).toBe('150.00');
      expect(next.body.payment.payout.amount).toBe('1350.00');
    } finally {
      await raised.close();
      process.env[COMMISSION_PERCENT_ENV] = '5';
    }

    // ...and the one taken at five percent still says five percent.
    const original = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(original.platformFee.toFixed(2)).toBe('75.00');
    expect(original.amount.minus(original.platformFee).toFixed(2)).toBe('1425.00');
  });

  it('balances at both ends of the price range', async () => {
    const { paymentId } = await openCheckout('1.00');
    const small = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });

    expect(small.platformFee.toFixed(2)).toBe('0.05');
    expect(small.amount.minus(small.platformFee).toFixed(2)).toBe('0.95');

    await resetDatabase(harness.prisma);

    const big = await openCheckout(`${String(PRODUCT_PRICE_MAX)}.00`);
    const stored = await harness.prisma.payment.findFirstOrThrow({ where: { id: big.paymentId } });

    expect(stored.platformFee.toFixed(2)).toBe('50000.00');
    expect(stored.amount.minus(stored.platformFee).toFixed(2)).toBe('950000.00');
  });

  it('reports fee and payout to the trainer, summing exactly to the amount', async () => {
    const { cookie } = await openCheckout('23.00');

    const list = await request(harness.app.getHttpServer())
      .get('/payments')
      .set('Cookie', cookie)
      .expect(200);

    const payment = list.body[0];

    // The float case, end to end through the API.
    expect(payment.amount.amount).toBe('23.00');
    expect(payment.platformFee.amount).toBe('1.15');
    expect(payment.payout.amount).toBe('21.85');
  });
});

describe('a subscription checkout', () => {
  it('tells the provider it recurs, and how often', async () => {
    const cookie = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, cookie);

    const product = await harness.prisma.product.create({
      data: {
        trainerId: await trainerIdFor(validRegistration.email),
        name: 'Супровід',
        kind: 'SUBSCRIPTION',
        period: 'QUARTERLY',
        priceAmount: new Prisma.Decimal('900.00'),
        currency: 'UAH',
      },
    });

    const opened = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', cookie)
      .send({ productId: product.id })
      .expect(201);

    const issued = harness.payments.issuedFor(String(opened.body.payment.id));

    expect(issued?.recurrence).toEqual({ period: 'QUARTERLY', startsAt: null });
  });

  it('tells the provider a one-time purchase does not recur', async () => {
    const { paymentId } = await openCheckout();

    expect(harness.payments.issuedFor(paymentId)?.recurrence).toBeNull();
  });
});

describe('what the client is never told', () => {
  it('omits the fee and the payout from the client payload entirely', async () => {
    const { clientCookie } = await openCheckout('1500.00');

    const response = await request(harness.app.getHttpServer())
      .get('/me/purchases')
      .set('Cookie', clientCookie)
      .expect(200);

    const payment = response.body.payments[0];

    expect(payment.amount).toEqual({ amount: '1500.00', currency: 'UAH' });

    // Not «is hidden» — is absent. The commission is a term between the
    // platform and the trainer, and the client's payload has nowhere to put it.
    expect(payment).not.toHaveProperty('platformFee');
    expect(payment).not.toHaveProperty('payout');

    // And nowhere else in the response either.
    expect(JSON.stringify(response.body)).not.toContain('platformFee');
    expect(JSON.stringify(response.body)).not.toContain('payout');
    expect(JSON.stringify(response.body)).not.toContain('75.00');
  });

  it('cannot open a checkout at all — there is no route that accepts one', async () => {
    const { clientCookie, clientId, productId } = await openCheckout();

    await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', clientCookie)
      .send({ productId })
      .expect(401);

    await request(harness.app.getHttpServer())
      .get('/payments')
      .set('Cookie', clientCookie)
      .expect(401);
  });

  it('sees only its own purchases', async () => {
    const { cookie, clientCookie } = await openCheckout();

    const sibling = await createAcceptedClient(harness, cookie, {
      fullName: 'Інший Клієнт',
      email: 'sibling@example.com',
    });

    const mine = await request(harness.app.getHttpServer())
      .get('/me/purchases')
      .set('Cookie', clientCookie)
      .expect(200);
    expect(mine.body.payments).toHaveLength(1);

    const theirs = await request(harness.app.getHttpServer())
      .get('/me/purchases')
      .set('Cookie', sibling.clientCookie)
      .expect(200);
    expect(theirs.body.payments).toEqual([]);
    expect(theirs.body.entitlements).toEqual([]);
  });
});

describe('the checkout link', () => {
  it('is stored while open, so the trainer can share it and the client return to it', async () => {
    harness.payments.outcome = 'PENDING';
    const { paymentId, clientCookie, body } = await openCheckout();

    expect(body.redirectUrl).toEqual(expect.stringContaining('http'));

    const stored = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(stored.checkoutUrl).toBe(body.redirectUrl);

    // And the client reaches the same link from their own app.
    const purchases = await request(harness.app.getHttpServer())
      .get('/me/purchases')
      .set('Cookie', clientCookie)
      .expect(200);

    expect(purchases.body.payments[0].checkoutUrl).toBe(body.redirectUrl);
  });

  it('is cleared once the payment settles — a spent page is not payable', async () => {
    const { paymentId, clientCookie } = await openCheckout();

    const settled = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });
    expect(settled.status).toBe('SUCCEEDED');

    // Not merely hidden by a screen: gone from the row, so «is this payable» is
    // one fact rather than a rule every surface has to remember.
    expect(settled.checkoutUrl).toBeNull();

    const purchases = await request(harness.app.getHttpServer())
      .get('/me/purchases')
      .set('Cookie', clientCookie)
      .expect(200);

    expect(purchases.body.payments[0].checkoutUrl).toBeNull();
  });

  it('is cleared on a failure too', async () => {
    harness.payments.outcome = 'FAILED';
    const { paymentId } = await openCheckout();

    const failed = await harness.prisma.payment.findFirstOrThrow({ where: { id: paymentId } });

    expect(failed.status).toBe('FAILED');
    expect(failed.checkoutUrl).toBeNull();
  });
});

describe('tenant isolation', () => {
  it("refuses a checkout for another trainer's client, and says only 404", async () => {
    const owner = await registerTrainer(harness);
    const { clientId } = await createAcceptedClient(harness, owner);

    const intruder = await registerTrainer(harness, secondRegistration);
    const theirProduct = await makeProduct(await trainerIdFor(secondRegistration.email));

    const trespass = await request(harness.app.getHttpServer())
      .post(`/clients/${clientId}/payments`)
      .set('Cookie', intruder)
      .send({ productId: theirProduct })
      .expect(404);

    const absent = await request(harness.app.getHttpServer())
      .post('/clients/ckdoesnotexist000000000/payments')
      .set('Cookie', intruder)
      .send({ productId: theirProduct })
      .expect(404);

    expect(trespass.body).toEqual(absent.body);
    expect(await harness.prisma.payment.count()).toBe(0);
  });

  it("keeps the payments list to the trainer's own rows", async () => {
    const { cookie } = await openCheckout();
    const intruder = await registerTrainer(harness, secondRegistration);

    const mine = await request(harness.app.getHttpServer())
      .get('/payments')
      .set('Cookie', cookie)
      .expect(200);
    expect(mine.body).toHaveLength(1);

    const theirs = await request(harness.app.getHttpServer())
      .get('/payments')
      .set('Cookie', intruder)
      .expect(200);
    expect(theirs.body).toEqual([]);
  });

  it('filters by status', async () => {
    harness.payments.outcome = 'PENDING';
    const { cookie } = await openCheckout();

    const pending = await request(harness.app.getHttpServer())
      .get('/payments?status=PENDING')
      .set('Cookie', cookie)
      .expect(200);
    expect(pending.body).toHaveLength(1);

    const succeeded = await request(harness.app.getHttpServer())
      .get('/payments?status=SUCCEEDED')
      .set('Cookie', cookie)
      .expect(200);
    expect(succeeded.body).toEqual([]);
  });
});
