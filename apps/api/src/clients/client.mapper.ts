import type { PublicClient } from '@gart/shared';

import type { ClientModel } from '../generated/prisma/models.js';

/**
 * Narrows a database row to the shape the trainer is allowed to see. `trainerId`
 * and `userId` stay behind: the caller already is the trainer, and the linked
 * user id is an internal identifier with no use on the client side.
 */
export function toPublicClient(client: ClientModel): PublicClient {
  return {
    id: client.id,
    fullName: client.fullName,
    email: client.email,
    status: client.status,
    invitedAt: client.invitedAt.toISOString(),
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}
