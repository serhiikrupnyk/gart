import { NotificationQueue, type PushJob } from '../src/notifications/notification-queue';
import {
  PushSendError,
  WebPushSender,
  type PushPayload,
  type PushTarget,
} from '../src/notifications/web-push-sender';

/**
 * In-memory queue bound to the NotificationQueue token by the harness, so no
 * test run needs a live Redis — the same seam FakeStorage gives object storage.
 *
 * `failNext` simulates an unreachable Redis: enqueueing throws, and the test
 * asserts that the in-app notification survived it anyway.
 */
export class FakeNotificationQueue extends NotificationQueue {
  readonly jobs: PushJob[] = [];
  failNext = false;
  ready = true;

  async enqueuePush(job: PushJob): Promise<void> {
    if (this.failNext) {
      throw new Error('redis unavailable');
    }

    this.jobs.push(job);
  }

  async isReady(): Promise<boolean> {
    return this.ready;
  }

  reset(): void {
    this.jobs.length = 0;
    this.failNext = false;
    this.ready = true;
  }
}

/** Records what would have been pushed, and can answer like a push service. */
export class FakeWebPushSender extends WebPushSender {
  readonly sent: { target: PushTarget; payload: PushPayload }[] = [];
  /** endpoint → status code to fail with, e.g. 410 for a gone subscription. */
  readonly failures = new Map<string, number>();

  publicKey(): string {
    return 'test-vapid-public-key';
  }

  async send(target: PushTarget, payload: PushPayload): Promise<void> {
    const status = this.failures.get(target.endpoint);

    if (status !== undefined) {
      throw new PushSendError(`push failed with ${String(status)}`, status);
    }

    this.sent.push({ target, payload });
  }

  reset(): void {
    this.sent.length = 0;
    this.failures.clear();
  }
}
