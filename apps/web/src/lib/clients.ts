import type {
  ClientListItem,
  ClientStatus,
  ClientWithInvite,
  CreateClientRequest,
  PublicClient,
  UpdateClientRequest,
} from '@gart/shared';

import { apiFetch } from './api';

export function listClients(status?: ClientStatus): Promise<ClientListItem[]> {
  const query = status === undefined ? '' : `?status=${status}`;

  return apiFetch<ClientListItem[]>(`/clients${query}`);
}

export function getClient(id: string): Promise<PublicClient> {
  return apiFetch<PublicClient>(`/clients/${id}`);
}

export function createClient(body: CreateClientRequest): Promise<ClientWithInvite> {
  return apiFetch<ClientWithInvite>('/clients', { method: 'POST', body: JSON.stringify(body) });
}

export function updateClient(id: string, body: UpdateClientRequest): Promise<PublicClient> {
  return apiFetch<PublicClient>(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function regenerateInvite(id: string): Promise<ClientWithInvite> {
  return apiFetch<ClientWithInvite>(`/clients/${id}/invite`, { method: 'POST' });
}

export const STATUS_LABELS: Record<ClientStatus, string> = {
  INVITED: 'Запрошено',
  ACTIVE: 'Активний',
  ARCHIVED: 'В архіві',
};
