import type { PublicTrainer, TrainerBrand } from '@gart/shared';

import type { TrainerModel } from '../generated/prisma/models.js';

/**
 * What a trainer's *client* may see of them: the brand and nothing else — no
 * ids, no timestamps, nothing about the account behind the brand.
 */
export function toTrainerBrand(trainer: TrainerModel): TrainerBrand {
  return {
    displayName: trainer.displayName,
    brandName: trainer.brandName,
    brandLogoUrl: trainer.brandLogoUrl,
    brandColor: trainer.brandColor,
  };
}

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
