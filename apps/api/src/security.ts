import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { requireEnv } from './env';

/**
 * Every cross-cutting security concern in one place, so the e2e tests configure
 * the application exactly as `main.ts` does — a guard or pipe that only exists
 * in production is a guard that never gets tested.
 */
export function configureSecurity(app: INestApplication): void {
  app.use(helmet());
  app.use(cookieParser());

  // Credentialed CORS forbids a wildcard origin, and we would not want one:
  // only the web app may hold a session cookie for this API.
  app.enableCors({
    origin: requireEnv('WEB_ORIGIN'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
