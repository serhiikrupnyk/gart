import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { NotificationQueue } from '../notifications/notification-queue';

interface HealthResponse {
  status: 'ok';
  db: 'ok';
  /**
   * Reported, but never fatal: the queue is a degradable dependency. In-app
   * notifications are written to Postgres regardless, so an unreachable Redis
   * costs asynchronous push and nothing else — calling the service unhealthy
   * would be the same lie the database check exists to prevent.
   */
  queue: 'ok' | 'error';
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: NotificationQueue,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // Reporting 200 while the database is unreachable is worse than no health
      // check at all — orchestrators would keep routing traffic here.
      throw new ServiceUnavailableException({ status: 'error', db: 'error' });
    }

    return { status: 'ok', db: 'ok', queue: (await this.queue.isReady()) ? 'ok' : 'error' };
  }
}
