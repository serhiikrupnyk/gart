import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NOTIFICATIONS_PER_PAGE,
  type NotificationList,
  type NotificationType,
  type PublicNotification,
} from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import type { NotificationAudience } from '../generated/prisma/enums.js';
import type { NotificationModel } from '../generated/prisma/models.js';
import { NotificationQueue } from './notification-queue';
import { trainerBody } from './notification-copy';

/** Which stream a viewer reads, derived from the hat their session wears. */
export interface NotificationScope {
  audience: NotificationAudience;
  trainerId: string;
  clientId?: string;
}

export interface TrainerEvent {
  trainerId: string;
  clientId: string;
  type: NotificationType;
  /** Appended after the event name — a skip reason, a measured value. */
  detail?: string | null;
}

/**
 * Something about the trainer's own account, with no client involved.
 *
 * `notifyTrainer` titles its notification with the client's name and links to
 * that client's page, which is right for «client X did Y» and wrong for
 * «your subscription lapsed». Billing has no client, so it says its own title.
 */
export interface TrainerDirectEvent {
  trainerId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  /** Where a tap should land, relative to the web app. */
  url: string;
}

export interface ClientEvent {
  trainerId: string;
  clientId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
}

/**
 * The one door for notifying somebody. Call sites pass facts — «this client
 * logged a workout» — and know nothing about queues, VAPID or subscriptions.
 *
 * Emission is BEST EFFORT and deliberately swallows its own failures: a
 * missing notification is a nuisance, a lost workout log is data loss, and the
 * client's write must never fail because a notification could not be sent.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: NotificationQueue,
  ) {}

  /** «Client X did Y» — the trainer's activity feed. */
  async notifyTrainer(event: TrainerEvent): Promise<void> {
    try {
      const [trainer, client] = await Promise.all([
        this.prisma.trainer.findUnique({
          where: { id: event.trainerId },
          select: { userId: true },
        }),
        this.prisma.client.findUnique({
          where: { id: event.clientId },
          select: { fullName: true },
        }),
      ]);

      if (trainer === null || client === null) {
        return;
      }

      await this.emit({
        userId: trainer.userId,
        trainerId: event.trainerId,
        clientId: event.clientId,
        audience: 'TRAINER',
        type: event.type,
        title: client.fullName,
        body: trainerBody(event.type, event.detail ?? null),
        url: `/dashboard/clients/${event.clientId}`,
      });
    } catch (error) {
      this.warn(error);
    }
  }

  /** «Your account did Y» — the trainer's own affairs, no client attached. */
  async notifyTrainerDirect(event: TrainerDirectEvent): Promise<void> {
    try {
      const trainer = await this.prisma.trainer.findUnique({
        where: { id: event.trainerId },
        select: { userId: true },
      });

      if (trainer === null) {
        return;
      }

      await this.emit({
        userId: trainer.userId,
        trainerId: event.trainerId,
        clientId: null,
        audience: 'TRAINER',
        type: event.type,
        title: event.title,
        body: event.body ?? null,
        url: event.url,
      });
    } catch (error) {
      this.warn(error);
    }
  }

  /** Something the trainer did that the client should know about. */
  async notifyClient(event: ClientEvent): Promise<void> {
    try {
      const client = await this.prisma.client.findUnique({
        where: { id: event.clientId },
        select: { userId: true },
      });

      // A client who has not accepted their invite has no account to notify.
      if (client?.userId == null) {
        return;
      }

      await this.emit({
        userId: client.userId,
        trainerId: event.trainerId,
        clientId: event.clientId,
        audience: 'CLIENT',
        type: event.type,
        title: event.title,
        body: event.body ?? null,
        url: '/client',
      });
    } catch (error) {
      this.warn(error);
    }
  }

  async list(scope: NotificationScope, page: number): Promise<NotificationList> {
    const where = whereFor(scope);
    const skip = (page - 1) * NOTIFICATIONS_PER_PAGE;

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: NOTIFICATIONS_PER_PAGE,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);

    return { items: items.map(toPublicNotification), total, unreadCount };
  }

  async markRead(scope: NotificationScope, id: string): Promise<PublicNotification> {
    // Scoped update: someone else's notification is as absent as a missing one.
    const { count } = await this.prisma.notification.updateMany({
      where: { ...whereFor(scope), id, readAt: null },
      data: { readAt: new Date() },
    });

    const notification =
      count === 0
        ? await this.prisma.notification.findFirst({ where: { ...whereFor(scope), id } })
        : await this.prisma.notification.findUnique({ where: { id } });

    if (notification === null) {
      throw new NotFoundException();
    }

    return toPublicNotification(notification);
  }

  async markAllRead(scope: NotificationScope): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { ...whereFor(scope), readAt: null },
      data: { readAt: new Date() },
    });
  }

  /**
   * The row first, the push second. If Redis is unreachable the notification
   * still exists and the bell still shows it — only the push is lost, which is
   * the whole point of keeping the durable channel in Postgres.
   */
  private async emit(input: {
    userId: string;
    trainerId: string;
    clientId: string | null;
    audience: NotificationAudience;
    type: NotificationType;
    title: string;
    body: string | null;
    url: string;
  }): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        trainerId: input.trainerId,
        clientId: input.clientId,
        audience: input.audience,
        type: input.type,
        title: input.title,
        body: input.body,
      },
    });

    try {
      await this.queue.enqueuePush({
        userId: input.userId,
        title: input.title,
        body: input.body,
        url: input.url,
      });
    } catch (error) {
      this.logger.warn(
        `Push not queued (in-app notification stands): ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private warn(error: unknown): void {
    this.logger.warn(
      `Notification not emitted: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

/**
 * A trainer reads their tenant's stream; a client reads only their own — the
 * per-(trainer, client) rule, so a sibling client sees nothing of another's.
 */
function whereFor(scope: NotificationScope) {
  return scope.audience === 'TRAINER'
    ? { trainerId: scope.trainerId, audience: 'TRAINER' as const }
    : { trainerId: scope.trainerId, clientId: scope.clientId, audience: 'CLIENT' as const };
}

function toPublicNotification(notification: NotificationModel): PublicNotification {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    clientId: notification.clientId,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt === null ? null : notification.readAt.toISOString(),
  };
}
