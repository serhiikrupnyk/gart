import type { ThrottlerModuleOptions } from '@nestjs/throttler';

const DEFAULT_GLOBAL_LIMIT = 120;
const DEFAULT_AUTH_LIMIT = 10;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MESSAGE_LIMIT = 20;
const DEFAULT_MESSAGE_WINDOW_MS = 60 * 60_000;

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Limits are supplied as functions, not values.
 *
 * `@Throttle(...)` runs when the controller class is defined — at import time —
 * so a literal would freeze whatever the environment held before the process had
 * finished configuring itself. `Resolvable<number>` is evaluated per request,
 * which keeps the environment authoritative and lets the rate-limit test tighten
 * the limit without rebuilding the module.
 */
export function globalThrottle(): ThrottlerModuleOptions {
  return [
    {
      ttl: () => numberFromEnv('THROTTLE_TTL_MS', DEFAULT_WINDOW_MS),
      limit: () => numberFromEnv('THROTTLE_LIMIT', DEFAULT_GLOBAL_LIMIT),
    },
  ];
}

/** Tighter budget for the credential endpoints: /auth/register and /auth/login. */
export function authThrottle(): Record<string, { limit: () => number; ttl: () => number }> {
  return {
    default: {
      ttl: () => numberFromEnv('AUTH_THROTTLE_TTL_MS', DEFAULT_WINDOW_MS),
      limit: () => numberFromEnv('AUTH_THROTTLE_LIMIT', DEFAULT_AUTH_LIMIT),
    },
  };
}

/**
 * A budget for messages a trainer sends their clients. Generous enough for a
 * working day, tight enough that the channel cannot become a firehose —
 * counted per trainer by TrainerThrottlerGuard, not per address.
 */
export function messageThrottle(): { limit: () => number; ttl: () => number } {
  return {
    ttl: () => numberFromEnv('MESSAGE_THROTTLE_TTL_MS', DEFAULT_MESSAGE_WINDOW_MS),
    limit: () => numberFromEnv('MESSAGE_THROTTLE_LIMIT', DEFAULT_MESSAGE_LIMIT),
  };
}
