import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';

import { PaymentsService } from '../payments/payments.service';
import { InactivityService } from './inactivity.service';
import { NotificationQueue, type PushJob } from './notification-queue';
import { PushDeliveryService } from './push-delivery.service';

// BullMQ rejects a colon in a queue name — it builds its own Redis keys
// around that separator, and the constructor throws before the app can boot.
const QUEUE_NAME = 'notifications-push';
const PUSH_JOB = 'push';
const SWEEP_JOB = 'inactivity-sweep';
const DEFAULT_SWEEP_CRON = '0 9 * * *';
const RENEWAL_JOB = 'subscription-renewals';
/**
 * Hourly, not daily.
 *
 * A renewal is money: a run that is missed because the process was restarting
 * at nine costs a charge until tomorrow, and the whole schedule drifts. Hourly
 * makes a missed run cost an hour, and the work is idempotent — the unique on
 * (subscription, period) means an extra run charges nothing twice.
 */
const DEFAULT_RENEWAL_CRON = '5 * * * *';

/**
 * The only file in the codebase that knows Redis exists.
 *
 * Producer and worker sit together deliberately: one deployment today, and
 * moving the worker to its own process later is a configuration change rather
 * than a redesign. Everything else calls NotificationService.
 *
 * Connection settings are chosen for graceful degradation, not throughput:
 * `lazyConnect` keeps a cold Redis out of application boot, and the offline
 * queue is disabled so `enqueuePush` FAILS FAST instead of buffering jobs into
 * memory that a restart would lose. The caller catches that failure and the
 * in-app notification — already written to Postgres — stands on its own.
 */
@Injectable()
export class BullMqNotificationQueue
  extends NotificationQueue
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BullMqNotificationQueue.name);

  private readonly connection: Redis;
  private readonly queue: Queue<PushJob>;
  private worker?: Worker<PushJob>;

  constructor(
    private readonly delivery: PushDeliveryService,
    private readonly moduleRef: ModuleRef,
  ) {
    super();

    this.connection = createConnection();
    this.queue = new Queue<PushJob>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });

    // Without a listener an ioredis error is an unhandled event that takes the
    // process down — the one outcome a degradable dependency must never cause.
    this.connection.on('error', (error: Error) => {
      this.logger.warn(`Redis unavailable: ${error.message}`);
    });
  }

  onModuleInit(): void {
    this.worker = new Worker<PushJob>(
      QUEUE_NAME,
      async (job) => {
        if (job.name === RENEWAL_JOB) {
          // Resolved at job time for the same reason the sweep is: reaching
          // into PaymentsService from the constructor is a dependency cycle
          // Nest hangs on rather than reports.
          const renewed = await this.moduleRef.get(PaymentsService, { strict: false }).renewDue();

          if (renewed > 0) {
            this.logger.log(`Renewed ${String(renewed)} subscriptions`);
          }

          return;
        }

        if (job.name === SWEEP_JOB) {
          // Resolved when a job runs, never in the constructor: InactivityService
          // reaches back through NotificationService to this very queue, and
          // injecting it directly is a dependency cycle — which Nest hangs on
          // silently rather than reporting. The sweep is job-time work anyway.
          await this.moduleRef.get(InactivityService, { strict: false }).sweep();

          return;
        }

        await this.delivery.deliver(job.data);
      },
      { connection: createConnection() },
    );

    // The repeatable job that justified BullMQ in Step 18. Upserting is
    // idempotent, so a restart re-declares rather than duplicates it — and if
    // Redis is unreachable the scheduler simply is not installed, which costs
    // alerts until it returns and nothing else.
    void this.queue
      .upsertJobScheduler(
        SWEEP_JOB,
        { pattern: process.env.INACTIVITY_SWEEP_CRON ?? DEFAULT_SWEEP_CRON },
        { name: SWEEP_JOB },
      )
      .catch((error: Error) => {
        this.logger.warn(`Inactivity sweep not scheduled: ${error.message}`);
      });

    // The renewal schedule, declared the same way and just as idempotently: a
    // restart re-declares rather than duplicates it.
    void this.queue
      .upsertJobScheduler(
        RENEWAL_JOB,
        { pattern: process.env.SUBSCRIPTION_RENEWAL_CRON ?? DEFAULT_RENEWAL_CRON },
        { name: RENEWAL_JOB },
      )
      .catch((error: Error) => {
        // Louder than the sweep's warning: a sweep that does not run costs an
        // alert, a renewal that does not run costs a charge.
        this.logger.error(`Subscription renewals not scheduled: ${error.message}`);
      });

    this.worker.on('error', (error: Error) => {
      this.logger.warn(`Push worker error: ${error.message}`);
    });
    this.worker.on('failed', (_job, error: Error) => {
      this.logger.warn(`Push job failed: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    this.connection.disconnect();
  }

  async enqueuePush(job: PushJob): Promise<void> {
    await this.queue.add(PUSH_JOB, job);
  }

  async isReady(): Promise<boolean> {
    try {
      const pong: string = await this.connection.ping();

      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}

function createConnection(): Redis {
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6380', {
    // BullMQ requires this to be null for its blocking commands.
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
}
