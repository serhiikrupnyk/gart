export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string | null;
  url: string;
}

/**
 * The push transport — and the DI token, so delivery can be tested without a
 * network or a real push service. `statusCode` is what tells a gone
 * subscription (404/410) from a transient failure worth retrying.
 */
export abstract class WebPushSender {
  abstract send(target: PushTarget, payload: PushPayload): Promise<void>;

  /** The key the browser needs to subscribe. Served, never bundled. */
  abstract publicKey(): string;
}

/** Thrown by the sender so the delivery service can act on the status. */
export class PushSendError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | undefined,
  ) {
    super(message);
    this.name = 'PushSendError';
  }
}
