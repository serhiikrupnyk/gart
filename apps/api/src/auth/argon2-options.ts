/**
 * OWASP's recommended argon2id configuration (m=19456 KiB, t=2, p=1).
 *
 * Every parameter is recorded in the PHC string argon2 produces, so these can be
 * raised later without invalidating hashes already in the database.
 *
 * `algorithm: 2` is `Algorithm.Argon2id`. The value is inlined because the
 * package declares it as an ambient const enum, which cannot be imported while
 * `isolatedModules` is on.
 *
 * Single source of truth: the seed script hashes with these too, so a demo
 * account is never created under different parameters than the API expects.
 */
export const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;
