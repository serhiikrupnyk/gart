import { Body, Controller, Module, Post, UseGuards } from '@nestjs/common';
import { TRIAL_MAX_CLIENTS } from '@gart/shared';
import request from 'supertest';

import { AuthModule } from '../src/auth/auth.module';
import { TrainerGuard } from '../src/auth/trainer.guard';
import {
  CLIENT_PASSWORD,
  createAcceptedClient,
  createClient,
  createHarness,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
  sessionCookie,
  subscribeTrainer,
  trainerIdFor,
  validRegistration,
} from './app-harness';

/**
 * A trainer-side write route that knows NOTHING about billing.
 *
 * The point of the whole design is that such a route is covered before anybody
 * writes it. Testing that means adding one — a route that already existed could
 * always be covered by an annotation somebody remembered.
 */
@Controller('unannotated-probe')
@UseGuards(TrainerGuard)
class ProbeController {
  @Post()
  write(@Body() body: unknown): { received: unknown } {
    return { received: body };
  }
}

@Module({ imports: [AuthModule], controllers: [ProbeController] })
class ProbeModule {}

let harness: Harness;

beforeAll(async () => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
  harness = await createHarness([ProbeModule]);
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await resetDatabase(harness.prisma);
  harness.payments.outcome = 'SUCCEEDED';
});

/** Runs a trainer's access out, as fourteen quiet days or a spent ladder would. */
async function lapse(email: string): Promise<void> {
  const trainerId = await trainerIdFor(harness, email);
  const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  await harness.prisma.subscription.update({
    where: { trainerId },
    data: { status: 'ENDED', accessUntil: past, endedAt: past, nextChargeAt: null },
  });
}

function addClient(cookie: string, index: number): request.Test {
  return request(harness.app.getHttpServer())
    .post('/clients')
    .set('Cookie', cookie)
    .send({ fullName: `Клієнт ${String(index)}`, email: `client${String(index)}@example.com` });
}

describe('the trial client allowance', () => {
  it('holds three clients, then refuses the fourth with 402 — at the API, not the button', async () => {
    const cookie = await registerTrainer(harness);

    for (let index = 1; index <= TRIAL_MAX_CLIENTS; index += 1) {
      await addClient(cookie, index).expect(201);
    }

    // Called directly, with no screen involved: the gate is the server's.
    const refused = await addClient(cookie, TRIAL_MAX_CLIENTS + 1).expect(402);
    expect((refused.body as { message: string }).message).toContain('підписку');

    // And nothing was written on the way to refusing.
    expect(await harness.prisma.client.count()).toBe(TRIAL_MAX_CLIENTS);
  });

  it('never touches the clients already there', async () => {
    const cookie = await registerTrainer(harness);

    for (let index = 1; index <= TRIAL_MAX_CLIENTS; index += 1) {
      await addClient(cookie, index).expect(201);
    }
    await addClient(cookie, TRIAL_MAX_CLIENTS + 1).expect(402);

    const list = await request(harness.app.getHttpServer())
      .get('/clients')
      .set('Cookie', cookie)
      .expect(200);

    expect((list.body as unknown[]).length).toBe(TRIAL_MAX_CLIENTS);
  });

  it('frees a place when somebody is archived, so nobody has to be deleted', async () => {
    const cookie = await registerTrainer(harness);
    const created: string[] = [];

    for (let index = 1; index <= TRIAL_MAX_CLIENTS; index += 1) {
      const response = await addClient(cookie, index).expect(201);
      created.push((response.body as { client: { id: string } }).client.id);
    }

    await addClient(cookie, 99).expect(402);

    await request(harness.app.getHttpServer())
      .patch(`/clients/${created[0] ?? ''}`)
      .set('Cookie', cookie)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    // The archived client still exists — the place came back, the history did
    // not go anywhere.
    await addClient(cookie, 99).expect(201);
    expect(await harness.prisma.client.count()).toBe(TRIAL_MAX_CLIENTS + 1);
  });

  it('is not escapable by archiving and un-archiving in a loop', async () => {
    const cookie = await registerTrainer(harness);
    const created: string[] = [];

    for (let index = 1; index <= TRIAL_MAX_CLIENTS; index += 1) {
      const response = await addClient(cookie, index).expect(201);
      created.push((response.body as { client: { id: string } }).client.id);
    }

    // Archive one, take the freed place with somebody new...
    await request(harness.app.getHttpServer())
      .patch(`/clients/${created[0] ?? ''}`)
      .set('Cookie', cookie)
      .send({ status: 'ARCHIVED' })
      .expect(200);
    await addClient(cookie, 99).expect(201);

    // ...then try to take the archived one back. Restoring OCCUPIES a place, so
    // it has to pass the same gate creating does — otherwise archive-and-restore
    // was an unbounded way round the allowance.
    const refused = await request(harness.app.getHttpServer())
      .patch(`/clients/${created[0] ?? ''}`)
      .set('Cookie', cookie)
      .send({ status: 'INVITED' })
      .expect(402);
    expect((refused.body as { message: string }).message).toContain('підписку');

    // Refused, and the archived client is untouched — nothing was destroyed to
    // enforce this.
    const still = await harness.prisma.client.findFirstOrThrow({ where: { id: created[0] ?? '' } });
    expect(still.status).toBe('ARCHIVED');
    expect(await harness.prisma.client.count()).toBe(TRIAL_MAX_CLIENTS + 1);
  });

  it('lets a client be restored when there is room for them', async () => {
    const cookie = await registerTrainer(harness);

    const first = await addClient(cookie, 1).expect(201);
    const id = (first.body as { client: { id: string } }).client.id;

    const server = harness.app.getHttpServer();
    await request(server)
      .patch(`/clients/${id}`)
      .set('Cookie', cookie)
      .send({ status: 'ARCHIVED' })
      .expect(200);
    await request(server)
      .patch(`/clients/${id}`)
      .set('Cookie', cookie)
      .send({ status: 'INVITED' })
      .expect(200);
  });

  it('lifts entirely on a paid plan, which is what «безлім клієнтів» means', async () => {
    const cookie = await registerTrainer(harness);
    await subscribeTrainer(harness, await trainerIdFor(harness, validRegistration.email));

    for (let index = 1; index <= TRIAL_MAX_CLIENTS + 2; index += 1) {
      await addClient(cookie, index).expect(201);
    }
  });

  it('is counted per trainer, never across them', async () => {
    const first = await registerTrainer(harness);
    const second = await registerTrainer(harness, secondRegistration);

    for (let index = 1; index <= TRIAL_MAX_CLIENTS; index += 1) {
      await addClient(first, index).expect(201);
    }

    // The second trainer's own allowance is untouched by the first filling theirs.
    await request(harness.app.getHttpServer())
      .post('/clients')
      .set('Cookie', second)
      .send({ fullName: 'Інший клієнт', email: 'other@example.com' })
      .expect(201);
  });
});

describe('a lapsed trainer', () => {
  it('keeps every read, and loses every write', async () => {
    const cookie = await registerTrainer(harness);
    await createClient(harness, cookie);
    await lapse(validRegistration.email);

    const server = harness.app.getHttpServer();

    // Reads: the whole workspace, exactly as before.
    const clients = await request(server).get('/clients').set('Cookie', cookie).expect(200);
    expect((clients.body as unknown[]).length).toBe(1);
    await request(server).get('/exercises').set('Cookie', cookie).expect(200);
    await request(server).get('/programs').set('Cookie', cookie).expect(200);

    // Writes: refused, with an explanation rather than a bare code.
    const refused = await request(server)
      .post('/clients')
      .set('Cookie', cookie)
      .send({ fullName: 'Новий клієнт', email: 'new@example.com' })
      .expect(402);
    expect((refused.body as { message: string }).message).toContain('перегляду');

    await request(server)
      .post('/exercises')
      .set('Cookie', cookie)
      .send({ name: 'Присідання', muscleGroups: ['LEGS'] })
      .expect(402);
  });

  it('loses nothing — the data is all still there after the refusals', async () => {
    const cookie = await registerTrainer(harness);
    const { client } = await createClient(harness, cookie);
    await lapse(validRegistration.email);

    await request(harness.app.getHttpServer())
      .post('/clients')
      .set('Cookie', cookie)
      .send({ fullName: 'Новий клієнт', email: 'new@example.com' })
      .expect(402);

    const detail = await request(harness.app.getHttpServer())
      .get(`/clients/${client.id}`)
      .set('Cookie', cookie)
      .expect(200);

    expect((detail.body as { id: string }).id).toBe(client.id);
    expect(await harness.prisma.client.count()).toBe(1);
  });

  it('can still sign out, sign in, and pay — the way out stays open', async () => {
    const cookie = await registerTrainer(harness);
    await lapse(validRegistration.email);

    const server = harness.app.getHttpServer();

    // Billing: readable AND writable, or the lapse would be a trap.
    await request(server).get('/billing/subscription').set('Cookie', cookie).expect(200);
    await request(server).get('/billing/payments').set('Cookie', cookie).expect(200);
    await request(server)
      .post('/billing/subscription/checkout')
      .set('Cookie', cookie)
      .send({ plan: 'PRO', period: 'MONTHLY' })
      .expect(201);

    // And paying restores the workspace immediately.
    await request(server)
      .post('/clients')
      .set('Cookie', cookie)
      .send({ fullName: 'Новий клієнт', email: 'new@example.com' })
      .expect(201);
  });

  it('can log out and back in while lapsed', async () => {
    const cookie = await registerTrainer(harness);
    await lapse(validRegistration.email);

    const server = harness.app.getHttpServer();

    await request(server).post('/auth/logout').set('Cookie', cookie).expect(204);
    await request(server)
      .post('/auth/login')
      .send({ email: validRegistration.email, password: validRegistration.password })
      .expect(200);
  });

  it('REFUSES A ROUTE THAT WAS NEVER TOLD ABOUT BILLING — the fail-closed property', async () => {
    const cookie = await registerTrainer(harness);
    const server = harness.app.getHttpServer();

    // The probe route carries no billing annotation of any kind. While the
    // trainer is paid up it behaves like any other route...
    await request(server)
      .post('/unannotated-probe')
      .set('Cookie', cookie)
      .send({ hello: 'world' })
      .expect(201);

    await lapse(validRegistration.email);

    // ...and once they lapse it is refused, without anybody having taught it
    // what a subscription is. That is what «global and fail-closed» has to mean:
    // a route added next year is covered before it is written.
    await request(server)
      .post('/unannotated-probe')
      .set('Cookie', cookie)
      .send({ hello: 'world' })
      .expect(402);
  });

  it('does not answer 402 to somebody who is not signed in', async () => {
    // The refusal must never leak that an account exists, let alone its billing
    // state. An anonymous caller gets the route's own 401.
    await request(harness.app.getHttpServer())
      .post('/clients')
      .send({ fullName: 'Хтось', email: 'someone@example.com' })
      .expect(401);
  });
});

describe("a lapsed trainer's clients", () => {
  it('are not punished for it: everything they do still works', async () => {
    const trainerCookie = await registerTrainer(harness);
    const { clientCookie, clientId } = await createAcceptedClient(harness, trainerCookie);
    const server = harness.app.getHttpServer();

    // Set up while the trainer is still live, so the client has real work to do.
    const habit = await request(server)
      .post(`/clients/${clientId}/habits`)
      .set('Cookie', trainerCookie)
      .send({ name: 'Пити воду', kind: 'CHECK' })
      .expect(201);
    const habitId = (habit.body as { id: string }).id;

    await lapse(validRegistration.email);

    // Reads: the whole client app.
    await request(server).get('/me/assignments').set('Cookie', clientCookie).expect(200);
    await request(server).get('/me/habits').set('Cookie', clientCookie).expect(200);

    // And WRITES — the half a lapse would take away if the guard were careless
    // about whose session it is looking at. Logging a habit:
    await request(server)
      .put(`/me/habits/${habitId}/logs/2026-08-20`)
      .set('Cookie', clientCookie)
      .send({ value: 1 })
      .expect(200);

    // ...and messaging the trainer, who can read it but can no longer reply.
    const thread = await request(server)
      .get('/chat/thread')
      .set('Cookie', clientCookie)
      .expect(200);
    const threadId = (thread.body as { id: string }).id;

    await request(server)
      .post(`/chat/threads/${threadId}/messages`)
      .set('Cookie', clientCookie)
      .send({ body: 'Доброго дня!' })
      .expect(201);

    await request(server)
      .post(`/chat/threads/${threadId}/messages`)
      .set('Cookie', trainerCookie)
      .send({ body: 'Вітаю!' })
      .expect(402);
  });

  it("spares a trainer who is ALSO somebody else's client, in their client hat", async () => {
    // The case the guard's context check exists for, and the sharpest version
    // of «clients are not punished»: a trainer whose OWN subscription has
    // lapsed is still someone else's client, and their coach is paid up.
    //
    // Linked directly because accept-invite refuses an existing account today.
    // The session it produces is the one multi-trainer linking will produce,
    // and the guard has to be right about it before that lands rather than
    // after — a CLIENT session whose user happens to own a Trainer must be
    // judged by whose workspace it is in, not by what its user also is.
    const lapsedTrainerCookie = await registerTrainer(harness);
    const payingTrainerCookie = await registerTrainer(harness, secondRegistration);

    const { client } = await createClient(harness, payingTrainerCookie, {
      fullName: validRegistration.displayName,
      email: 'coachee@example.com',
    });
    const lapsedUser = await harness.prisma.user.findFirstOrThrow({
      where: { email: validRegistration.email },
    });
    await harness.prisma.client.update({
      where: { id: client.id },
      data: { userId: lapsedUser.id, status: 'ACTIVE' },
    });

    await lapse(validRegistration.email);

    const server = harness.app.getHttpServer();
    const login = await request(server)
      .post('/auth/client/login')
      .send({ email: validRegistration.email, password: validRegistration.password })
      .expect(200);
    const clientCookie = sessionCookie(login.headers as Record<string, unknown>);

    // In their own workspace they are read-only...
    await request(server)
      .post('/clients')
      .set('Cookie', lapsedTrainerCookie)
      .send({ fullName: 'Хтось', email: 'someone@example.com' })
      .expect(402);

    // ...and in their coach's workspace, where the bill is somebody else's and
    // paid, they are an ordinary client with an ordinary client's writes.
    const thread = await request(server)
      .get('/chat/thread')
      .set('Cookie', clientCookie)
      .expect(200);

    await request(server)
      .post(`/chat/threads/${(thread.body as { id: string }).id}/messages`)
      .set('Cookie', clientCookie)
      .send({ body: 'Готовий до тренування' })
      .expect(201);
  });

  it('can still sign in while their trainer is lapsed', async () => {
    const trainerCookie = await registerTrainer(harness);
    const { email } = await createAcceptedClient(harness, trainerCookie);

    await lapse(validRegistration.email);

    await request(harness.app.getHttpServer())
      .post('/auth/client/login')
      .send({ email, password: CLIENT_PASSWORD })
      .expect(200);
  });
});
