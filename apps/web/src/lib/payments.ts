import type {
  CheckoutResult,
  ClientPurchases,
  PaymentStatusFilter,
  PublicPayment,
} from '@gart/shared';

import { apiFetch } from './api';

export async function listPayments(status: PaymentStatusFilter): Promise<PublicPayment[]> {
  return apiFetch<PublicPayment[]>(`/payments?status=${status}`);
}

/** What the signed-in client owes and owns. Read-only: a checkout is the trainer's act. */
export async function myPurchases(): Promise<ClientPurchases> {
  return apiFetch<ClientPurchases>('/me/purchases');
}

/**
 * Opens a checkout for one of the trainer's clients.
 *
 * Only a product id crosses the wire: the amount and the platform's fee are
 * computed from the stored product on the server, and there is no field here
 * that could carry either.
 */
export async function createCheckout(clientId: string, productId: string): Promise<CheckoutResult> {
  return apiFetch<CheckoutResult>(`/clients/${clientId}/payments`, {
    method: 'POST',
    body: JSON.stringify({ productId }),
  });
}
