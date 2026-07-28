import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { requireEnv } from '../env';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The Prisma client, tied to the Nest lifecycle so connections open on boot and
 * close on shutdown rather than being left to the garbage collector.
 *
 * Prisma 7 requires an explicit driver adapter; PrismaPg owns the node-postgres
 * connection pool.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
