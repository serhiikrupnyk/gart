import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

interface HealthResponse {
  status: 'ok';
  db: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // Reporting 200 while the database is unreachable is worse than no health
      // check at all — orchestrators would keep routing traffic here.
      throw new ServiceUnavailableException({ status: 'error', db: 'error' });
    }

    return { status: 'ok', db: 'ok' };
  }
}
