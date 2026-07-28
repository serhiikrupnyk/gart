import type { PublicTrainer } from '@gart/shared';

import type { TrainerModel } from '../generated/prisma/models.js';

/** Narrows a database row to the shape the API is allowed to hand out. */
export function toPublicTrainer(trainer: TrainerModel): PublicTrainer {
  return {
    id: trainer.id,
    userId: trainer.userId,
    displayName: trainer.displayName,
    brandName: trainer.brandName,
    brandLogoUrl: trainer.brandLogoUrl,
    brandColor: trainer.brandColor,
    createdAt: trainer.createdAt.toISOString(),
    updatedAt: trainer.updatedAt.toISOString(),
  };
}
