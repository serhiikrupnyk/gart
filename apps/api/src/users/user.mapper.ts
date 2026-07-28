import type { PublicUser } from '@gart/shared';

import type { UserModel } from '../generated/prisma/models.js';

/** Narrows a database row to the shape the API is allowed to hand out. */
export function toPublicUser(user: UserModel): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
