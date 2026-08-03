import { apiFetch } from './api';

export function sendClientMessage(clientId: string, text: string): Promise<{ sent: true }> {
  return apiFetch<{ sent: true }>(`/clients/${clientId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}
