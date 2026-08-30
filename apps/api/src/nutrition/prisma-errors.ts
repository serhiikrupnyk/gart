const FOREIGN_KEY_ERROR = 'P2003';

/**
 * A foreign-key violation — Postgres 23503 through Prisma.
 *
 * Lives here rather than inside whichever service happened to need it first:
 * three modules now map it to their own 404 or 409, and a generic driver
 * concern importing from a feature service was the wrong direction.
 */
export function isForeignKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === FOREIGN_KEY_ERROR
  );
}
