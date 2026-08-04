import { ThrottlerException, type ThrottlerStorage } from '@nestjs/throttler';

export interface RateLimit {
  limit: () => number;
  ttl: () => number;
}

/**
 * Counting a budget against a key we choose, rather than the address the
 * request arrived from.
 *
 * The stock guard tracks by IP, and that cannot be fixed by overriding its
 * tracker: the global throttler runs BEFORE route guards, when no tenant is
 * attached yet. So the routes that need a per-principal budget count here,
 * against the same storage, after their auth guard has run.
 *
 * The block lasts the rest of the window. A zero would make the storage expire
 * the block on the spot and reset the counter with it — a limiter that never
 * limits.
 */
export async function enforceRateLimit(
  storage: ThrottlerStorage,
  name: string,
  tracker: string,
  limits: RateLimit,
): Promise<void> {
  const window = limits.ttl();
  const ceiling = limits.limit();

  const record = await storage.increment(`${name}:${tracker}`, window, ceiling, window, name);

  if (record.totalHits > ceiling || record.isBlocked) {
    throw new ThrottlerException();
  }
}
