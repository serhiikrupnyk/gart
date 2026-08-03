/** What a delivery job carries: whose devices, and what to show on them. */
export interface PushJob {
  userId: string;
  title: string;
  body: string | null;
  /** Where a tap should land, relative to the web app. */
  url: string;
}

/**
 * The queue contract — and the DI token. Production binds the BullMQ/Redis
 * implementation; tests bind an in-memory fake, so no test run ever needs a
 * live Redis. Exactly the seam StorageService established for object storage.
 *
 * Deliberately one verb. Nothing outside this folder knows a queue exists:
 * callers ask NotificationService to notify someone.
 */
export abstract class NotificationQueue {
  abstract enqueuePush(job: PushJob): Promise<void>;

  /** Whether the backing queue is reachable, for the health check. */
  abstract isReady(): Promise<boolean>;
}
