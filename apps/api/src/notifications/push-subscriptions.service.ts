import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { SubscribePushDto } from './dto/notification.dto';

/**
 * A device's agreement to receive push, stored against the USER rather than a
 * tenant: the same person may hold both hats on one phone, and the browser's
 * subscription belongs to the device, not the role.
 */
@Injectable()
export class PushSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Re-subscribing the same endpoint refreshes it instead of duplicating. */
  async subscribe(userId: string, dto: SubscribePushDto): Promise<void> {
    const data = {
      userId,
      p256dh: dto.p256dh,
      auth: dto.auth,
      userAgent: dto.userAgent == null || dto.userAgent === '' ? null : dto.userAgent,
    };

    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { endpoint: dto.endpoint, ...data },
      update: data,
    });
  }

  /**
   * Scoped by user, so one person cannot remove another's device — and a
   * subscription that is already gone answers the same as one removed now,
   * because unsubscribing twice is not an error worth reporting.
   */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }
}
