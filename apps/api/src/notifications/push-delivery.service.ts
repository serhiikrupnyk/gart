import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { PushJob } from './notification-queue';
import { PushSendError, WebPushSender } from './web-push-sender';

/**
 * Sends one job to every device a user has agreed to, and keeps that list
 * honest.
 *
 * A push service answers 404 or 410 when a subscription is gone for good — a
 * browser cleared its data, the PWA was uninstalled. Those two codes, and only
 * those, delete the row: a 500 is the push service having a bad minute, and
 * throwing away a working subscription over it would silently unsubscribe the
 * user for ever.
 *
 * Lives apart from the worker so it can be tested without Redis or a network.
 */
@Injectable()
export class PushDeliveryService {
  private readonly logger = new Logger(PushDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: WebPushSender,
  ) {}

  async deliver(job: PushJob): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: job.userId },
    });

    for (const subscription of subscriptions) {
      try {
        await this.sender.send(subscription, {
          title: job.title,
          body: job.body,
          url: job.url,
        });
      } catch (error) {
        await this.handleFailure(subscription.id, subscription.endpoint, error);
      }
    }
  }

  private async handleFailure(id: string, endpoint: string, error: unknown): Promise<void> {
    const statusCode = error instanceof PushSendError ? error.statusCode : undefined;

    if (statusCode === 404 || statusCode === 410) {
      await this.prisma.pushSubscription.delete({ where: { id } }).catch(() => undefined);
      this.logger.log(`Pruned gone subscription ${endpoint.slice(0, 40)}…`);

      return;
    }

    // Anything else is transient: let the job's retry policy have another go.
    throw error;
  }
}
