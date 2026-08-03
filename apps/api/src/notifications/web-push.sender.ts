import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';

import { PushSendError, WebPushSender, type PushPayload, type PushTarget } from './web-push-sender';

/**
 * The `web-push` binding: VAPID signing and payload encryption. Keys come from
 * the environment and the private one never leaves it — the browser is handed
 * only the public key, and only through the API.
 *
 * Configuration is lazy so a deployment without VAPID keys still boots and
 * serves; in-app notifications do not depend on push being configured at all.
 */
@Injectable()
export class WebPushSenderImpl extends WebPushSender {
  private readonly logger = new Logger(WebPushSenderImpl.name);
  private configured = false;

  publicKey(): string {
    return process.env.VAPID_PUBLIC_KEY ?? '';
  }

  async send(target: PushTarget, payload: PushPayload): Promise<void> {
    if (!this.configure()) {
      // Nothing to retry: without keys no attempt could ever succeed.
      return;
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        JSON.stringify(payload),
      );
    } catch (error: unknown) {
      const statusCode =
        typeof error === 'object' && error !== null
          ? (error as { statusCode?: number }).statusCode
          : undefined;

      throw new PushSendError(error instanceof Error ? error.message : 'push failed', statusCode);
    }
  }

  private configure(): boolean {
    if (this.configured) {
      return true;
    }

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (
      publicKey === undefined ||
      publicKey === '' ||
      privateKey === undefined ||
      privateKey === '' ||
      subject === undefined ||
      subject === ''
    ) {
      this.logger.warn('VAPID keys are not configured; web push is disabled.');

      return false;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.configured = true;

    return true;
  }
}
