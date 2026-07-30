import request from 'supertest';

import { createHarness, type Harness, resetDatabase, validRegistration } from './app-harness';

const LIMIT = 3;

describe('credential endpoints are rate limited', () => {
  let harness: Harness;

  beforeAll(async () => {
    // Set before the application is built so the throttler picks it up. Each
    // spec file has its own module registry and its own in-memory counters.
    process.env.AUTH_THROTTLE_LIMIT = String(LIMIT);
    process.env.AUTH_THROTTLE_TTL_MS = '60000';
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
    delete process.env.AUTH_THROTTLE_LIMIT;
    delete process.env.AUTH_THROTTLE_TTL_MS;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
  });

  it('returns 429 once the login limit is exceeded', async () => {
    const attempt = async (): Promise<number> => {
      const response = await request(harness.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@gart.fit', password: 'whatever-value' });

      return response.status;
    };

    const statuses: number[] = [];
    for (let index = 0; index < LIMIT + 1; index += 1) {
      statuses.push(await attempt());
    }

    expect(statuses.slice(0, LIMIT)).toEqual(Array<number>(LIMIT).fill(401));
    expect(statuses.at(-1)).toBe(429);
  });

  it('rate limits registration on the same budget', async () => {
    let lastStatus = 0;

    for (let index = 0; index < LIMIT + 1; index += 1) {
      const response = await request(harness.app.getHttpServer())
        .post('/auth/register')
        .send({ ...validRegistration, email: `trainer${String(index)}@gart.fit` });

      lastStatus = response.status;
    }

    expect(lastStatus).toBe(429);
  });
});
