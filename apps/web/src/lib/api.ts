/** Exported because the chat stream opens an EventSource against it directly. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001';

/** Message shown when the API is unreachable or returns something unreadable. */
const FALLBACK_ERROR = 'Не вдалося з’єднатися із сервером. Спробуйте ще раз.';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Nest returns `message` as a string, or as an array when several validation
 * rules fail at once.
 */
function readErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const { message } = body as { message?: unknown };

  if (typeof message === 'string') {
    return message;
  }

  if (Array.isArray(message) && typeof message[0] === 'string') {
    return message[0];
  }

  return undefined;
}

/**
 * `credentials: 'include'` is what carries the httpOnly session cookie across
 * origins — the API is on a different port in development.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(FALLBACK_ERROR, 0);
  }

  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(readErrorMessage(body) ?? FALLBACK_ERROR, response.status);
  }

  return body as T;
}
