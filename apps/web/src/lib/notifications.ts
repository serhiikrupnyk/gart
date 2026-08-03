import type { NotificationList, PublicNotification, PushPublicKeyResponse } from '@gart/shared';

import { apiFetch } from './api';

export function listNotifications(page = 1): Promise<NotificationList> {
  return apiFetch<NotificationList>(`/notifications?page=${String(page)}`);
}

export function markNotificationRead(id: string): Promise<PublicNotification> {
  return apiFetch<PublicNotification>(`/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead(): Promise<null> {
  return apiFetch<null>('/notifications/read-all', { method: 'POST' });
}

export function getPushPublicKey(): Promise<PushPublicKeyResponse> {
  return apiFetch<PushPublicKeyResponse>('/notifications/push/key');
}

export function subscribeToPush(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<null> {
  return apiFetch<null>('/notifications/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}
