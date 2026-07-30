import type { TransformFnParams } from 'class-transformer';

/**
 * The email column is citext, so the database already compares case-insensitively.
 * Normalising anyway keeps what we store canonical and means lookups behave the
 * same if the column type ever changes.
 */
export function normalizeEmail({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export function trimmed({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
