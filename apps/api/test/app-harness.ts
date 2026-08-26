import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ClientWithInvite, PublicClient } from '@gart/shared';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { configureSecurity } from '../src/security';
import { NotificationQueue } from '../src/notifications/notification-queue';
import { WebPushSender } from '../src/notifications/web-push-sender';
import { FakePaymentProvider } from '../src/payments/fake-payment-provider';
import { PaymentProvider } from '../src/payments/payment-provider';
import { StorageService } from '../src/storage/storage.service';
import { FakeNotificationQueue, FakeWebPushSender } from './fake-notifications';
import { FakeStorage } from './fake-storage';
import { chargeAt, periodFrom } from '../src/payments/subscriptions.service';

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  /** Bound to the StorageService token — no test ever needs a real bucket. */
  storage: FakeStorage;
  /** Bound to the queue and push tokens — no test ever needs Redis. */
  queue: FakeNotificationQueue;
  push: FakeWebPushSender;
  /** Bound to the payment token — no test ever needs an acquirer. */
  payments: FakePaymentProvider;
  close: () => Promise<void>;
}

/**
 * Boots the real application, configured exactly as `main.ts` configures it.
 *
 * Each spec file gets its own instance so the throttler's in-memory counters
 * never leak between suites.
 */
export async function createHarness(
  /**
   * Extra modules mounted beside the real application.
   *
   * Exists for one test: proving that a trainer-side write route added with no
   * billing annotation of any kind is still refused for a lapsed trainer. That
   * property is about routes that do NOT exist yet, so the only honest way to
   * assert it is to add one.
   */
  extraImports: NonNullable<ModuleMetadata['imports']> = [],
): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, ...extraImports] })
    .overrideProvider(StorageService)
    .useValue(new FakeStorage())
    .overrideProvider(NotificationQueue)
    .useValue(new FakeNotificationQueue())
    .overrideProvider(WebPushSender)
    .useValue(new FakeWebPushSender())
    .overrideProvider(PaymentProvider)
    .useValue(new FakePaymentProvider())
    .compile();

  // Silenced because one test deliberately triggers a 500, and Nest would print
  // its stack trace as though something had gone wrong. Assertions are the
  // signal here, not logs.
  const app = moduleRef.createNestApplication({ logger: false });
  configureSecurity(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const storage = app.get(StorageService) as FakeStorage;
  const queue = app.get(NotificationQueue) as FakeNotificationQueue;
  const push = app.get(WebPushSender) as FakeWebPushSender;
  const payments = app.get(PaymentProvider) as FakePaymentProvider;

  return {
    app,
    prisma,
    storage,
    queue,
    push,
    payments,
    close: async () => {
      await app.close();
    },
  };
}

/** Clears every table between tests. CASCADE also removes dependent rows. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "PaymentEvent", "Payment", "Subscription", "ChatMessage", "ChatThread", "Notification", "PushSubscription", "HabitLog", "Habit", "ProgressEntry", "ProgressVariable", "ProgressPhoto", "WorkoutSetLog", "WorkoutLog", "AssignmentExercise", "AssignmentSection", "Assignment", "ProgramExercise", "ProgramSection", "Program", "Exercise", "Category", "ClientInvite", "Client", "TeamMember", "Session", "Trainer", "User" CASCADE',
  );
}

export const validRegistration = {
  email: 'trainer@gart.fit',
  password: 'correct-horse-battery',
  displayName: 'Олена Ковальчук',
};

export const secondRegistration = {
  email: 'other-trainer@gart.fit',
  password: 'correct-horse-battery',
  displayName: 'Іван Мельник',
};

/** Registers a trainer and returns their session cookie. */
export async function registerTrainer(
  harness: Harness,
  registration: typeof validRegistration = validRegistration,
): Promise<string> {
  const response = await request(harness.app.getHttpServer())
    .post('/auth/register')
    .send(registration)
    .expect(201);

  return sessionCookie(response.headers as Record<string, unknown>);
}

/** Creates a client for the trainer holding `cookie`, returning it and its invite. */
export async function createClient(
  harness: Harness,
  cookie: string,
  overrides: Partial<{ fullName: string; email: string }> = {},
): Promise<{ client: PublicClient; inviteUrl: string; token: string }> {
  const response = await request(harness.app.getHttpServer())
    .post('/clients')
    .set('Cookie', cookie)
    .send({ fullName: 'Марія Бондаренко', email: 'maria@example.com', ...overrides })
    .expect(201);

  const body = response.body as ClientWithInvite;

  return { ...body, token: tokenFromInviteUrl(body.inviteUrl) };
}

export const CLIENT_PASSWORD = 'client-password-1';

/**
 * Registers a trainer, creates a client and accepts the invite — the full path
 * to an ACTIVE client with an account. Returns the client-context cookie along
 * with everything needed to log in again later.
 */
export async function createAcceptedClient(
  harness: Harness,
  trainerCookie: string,
  overrides: Partial<{ fullName: string; email: string }> = {},
): Promise<{ clientCookie: string; clientId: string; email: string }> {
  const { client, token } = await createClient(harness, trainerCookie, overrides);

  const accepted = await request(harness.app.getHttpServer())
    .post('/auth/accept-invite')
    .send({ token, password: CLIENT_PASSWORD })
    .expect(204);

  return {
    clientCookie: sessionCookie(accepted.headers as Record<string, unknown>),
    clientId: client.id,
    email: client.email,
  };
}

export function tokenFromInviteUrl(inviteUrl: string): string {
  const token = inviteUrl.split('/invite/')[1];

  if (token === undefined || token.length === 0) {
    throw new Error(`Invite URL had no token: ${inviteUrl}`);
  }

  return token;
}

/** Supertest types `headers` loosely; these two helpers read it without casts. */
type ResponseHeaders = Record<string, unknown>;

/** Every Set-Cookie directive as one string, for asserting flags. */
export function setCookieHeader(headers: ResponseHeaders): string {
  const raw = headers['set-cookie'];

  if (Array.isArray(raw)) {
    return raw.join(';');
  }

  return typeof raw === 'string' ? raw : '';
}

/** Pulls the session cookie out of a response so it can be replayed. */
export function sessionCookie(headers: ResponseHeaders): string {
  const raw = headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : [];
  const session = cookies.find((cookie) => cookie.startsWith('gart_session='));

  if (session === undefined) {
    throw new Error('Response did not set a session cookie');
  }

  return session.split(';')[0] ?? '';
}

/**
 * Puts a trainer on a plan, as a completed subscribe flow would.
 *
 * Registration already leaves a TRIALING row behind, so this UPDATES rather
 * than inserts: `Subscription.trainerId` is unique, and a trainer has exactly
 * one arrangement over their whole life.
 *
 * Used where a test needs a paid subscription without walking a checkout —
 * dunning, renewal, cancellation. The purchase path has its own spec.
 */
export async function subscribeTrainer(
  harness: Harness,
  trainerId: string,
  overrides: Partial<{
    plan: 'PRO' | 'GROW' | 'SCALE';
    period: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
    periodStart: Date;
    recurrenceRef: string | null;
  }> = {},
): Promise<{ id: string; currentPeriodEnd: Date; nextChargeAt: Date }> {
  const periodStart = overrides.periodStart ?? new Date('2026-08-01T12:00:00.000Z');
  const period = overrides.period ?? 'MONTHLY';
  const periodEnd = periodFrom(periodStart, period, periodStart.getUTCDate());

  const data = {
    plan: overrides.plan ?? ('PRO' as const),
    period,
    status: 'ACTIVE' as const,
    anchorDay: periodStart.getUTCDate(),
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    accessUntil: periodEnd,
    nextChargeAt: chargeAt(periodEnd),
    failedAttempts: 0,
    pendingPeriod: null,
    cancelledAt: null,
    endedAt: null,
    recurrenceRef:
      overrides.recurrenceRef === undefined ? 'fake_mandate_test' : overrides.recurrenceRef,
  };

  const subscription = await harness.prisma.subscription.upsert({
    where: { trainerId },
    update: data,
    create: { trainerId, ...data },
  });

  return {
    id: subscription.id,
    currentPeriodEnd: subscription.currentPeriodEnd,
    nextChargeAt: subscription.nextChargeAt ?? periodEnd,
  };
}

/** The trainer id behind a registration email. */
export async function trainerIdFor(harness: Harness, email: string): Promise<string> {
  const user = await harness.prisma.user.findFirstOrThrow({
    where: { email },
    include: { trainer: true },
  });

  if (user.trainer === null) {
    throw new Error(`User ${email} has no trainer`);
  }

  return user.trainer.id;
}
