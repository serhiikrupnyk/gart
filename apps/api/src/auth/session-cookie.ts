import type { CookieOptions, Request } from 'express';

export const SESSION_COOKIE_NAME = 'gart_session';

/**
 * `sameSite: 'lax'` blocks the cookie on cross-site POSTs, which is the CSRF
 * vector that matters for these endpoints. `secure` is off in development
 * because localhost is served over plain HTTP.
 */
function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

export function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return { ...baseOptions(), expires: expiresAt };
}

export function clearedSessionCookieOptions(): CookieOptions {
  return baseOptions();
}

export function readSessionCookie(request: Request): string | undefined {
  const cookies: unknown = request.cookies;

  if (typeof cookies !== 'object' || cookies === null) {
    return undefined;
  }

  const token = (cookies as Record<string, unknown>)[SESSION_COOKIE_NAME];

  return typeof token === 'string' && token.length > 0 ? token : undefined;
}
