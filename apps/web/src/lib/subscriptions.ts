import type {
  ClientSubscription,
  PublicSubscription,
  SubscriptionStatusFilter,
} from '@gart/shared';

import { apiFetch } from './api';

export async function listSubscriptions(
  status: SubscriptionStatusFilter,
): Promise<PublicSubscription[]> {
  return apiFetch<PublicSubscription[]>(`/subscriptions?status=${status}`);
}

export async function cancelSubscription(id: string): Promise<PublicSubscription> {
  return apiFetch<PublicSubscription>(`/subscriptions/${id}/cancel`, { method: 'POST' });
}

export async function reactivateSubscription(id: string): Promise<PublicSubscription> {
  return apiFetch<PublicSubscription>(`/subscriptions/${id}/reactivate`, { method: 'POST' });
}

/** The signed-in client's own subscriptions. */
export async function mySubscriptions(): Promise<ClientSubscription[]> {
  return apiFetch<ClientSubscription[]>('/me/subscriptions');
}

export async function cancelMySubscription(id: string): Promise<ClientSubscription> {
  return apiFetch<ClientSubscription>(`/me/subscriptions/${id}/cancel`, { method: 'POST' });
}

export async function reactivateMySubscription(id: string): Promise<ClientSubscription> {
  return apiFetch<ClientSubscription>(`/me/subscriptions/${id}/reactivate`, { method: 'POST' });
}
