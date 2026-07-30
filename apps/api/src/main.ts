import 'dotenv/config';
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureSecurity } from './security';

const DEFAULT_PORT = 4001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT) || DEFAULT_PORT;

  configureSecurity(app);

  // Without this, onModuleDestroy never runs on SIGINT/SIGTERM and the Postgres
  // pool is torn down abruptly.
  app.enableShutdownHooks();

  await app.listen(port);
}

void bootstrap();
