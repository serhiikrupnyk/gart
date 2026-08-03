import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';

import { NotificationQueue, type PushJob } from './notification-queue';
import { PushDeliveryService } from './push-delivery.service';

const QUEUE_NAME = 'notifications:push';

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

  constructor(private readonly delivery: PushDeliveryService) {
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
        await this.delivery.deliver(job.data);
      },
      { connection: createConnection() },
    );

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
    await this.queue.add('push', job);
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
