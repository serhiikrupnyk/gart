import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** 256 bits of CSPRNG output, URL-safe so it can be carried in a link or cookie. */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Bearer tokens are stored only as their digest, so a database leak yields
 * nothing usable. SHA-256 rather than argon2 is deliberate: the token is already
 * high-entropy random, so there is nothing to brute-force, and lookups need to
 * be a single indexed query.
 *
 * Used for both session cookies and client invites — one way to handle tokens.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
