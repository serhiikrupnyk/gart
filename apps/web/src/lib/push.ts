import { getPushPublicKey, subscribeToPush } from './notifications';

/** Not every browser can do this — iOS Safari only inside an installed PWA. */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported';
}

/**
 * VAPID keys travel as base64url; PushManager wants raw bytes. The buffer is
 * allocated explicitly because the DOM types require an ArrayBuffer-backed
 * view, which `Uint8Array.from` does not promise.
 */
function decodeKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));

  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }

  return bytes;
}

function keyToBase64(key: ArrayBuffer | null): string {
  if (key === null) {
    return '';
  }

  return btoa(String.fromCharCode(...new Uint8Array(key)));
}

/**
 * The whole opt-in, in the order a browser demands it: register the worker,
 * ask permission, subscribe, tell the API. Called only from a deliberate click
 * — an unprompted permission dialog is how notifications get blocked for ever.
 */
export async function enablePush(): Promise<NotificationPermission> {
  if (!pushSupported()) {
    return 'denied';
  }

  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    return permission;
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  const { publicKey } = await getPushPublicKey();

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeKey(publicKey),
  });

  await subscribeToPush({
    endpoint: subscription.endpoint,
    p256dh: keyToBase64(subscription.getKey('p256dh')),
    auth: keyToBase64(subscription.getKey('auth')),
    userAgent: navigator.userAgent.slice(0, 200),
  });

  return permission;
}
