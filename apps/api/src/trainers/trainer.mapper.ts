import type { BrandSettings, PublicTrainer, TrainerBrand } from '@gart/shared';

import type { TrainerModel } from '../generated/prisma/models.js';

/**
 * Where a stored logo is served from.
 *
 * The key's random segment is in the path, so the URL changes on every upload —
 * which is exactly what makes it safe for the serving route to tell browsers
 * the bytes are immutable and never to revalidate.
 */
export function brandLogoUrl(trainer: TrainerModel): string | null {
  if (trainer.brandLogoKey === null) {
    return null;
  }

  const fileName = trainer.brandLogoKey.split('/').at(-1);

  return fileName === undefined ? null : `/brand/${trainer.id}/logo/${fileName}`;
}

/**
 * What a trainer's *client* may see of them: the brand and nothing else — no
 * timestamps, nothing about the account behind the brand.
 *
 * The logo URL necessarily carries the trainer's opaque id, since that is how
 * the serving route scopes its lookup. It grants nothing: no route in this API
 * accepts a trainer id from a caller.
 */
export function toTrainerBrand(trainer: TrainerModel): TrainerBrand {
  return {
    displayName: trainer.displayName,
    brandName: trainer.brandName,
    brandLogoUrl: brandLogoUrl(trainer),
    brandColor: trainer.brandColor,
  };
}

/**
 * What the trainer edits on their own brand screen.
 *
 * The same fields their client sees, because that is the whole point: this
 * screen shows a trainer what they are giving their clients. Delegating rather
 * than repeating the body means the two cannot drift apart by accident — and
 * when the settings screen eventually grows a field a client must NOT see, that
 * divergence will have to be written deliberately.
 */
export function toBrandSettings(trainer: TrainerModel): BrandSettings {
  return toTrainerBrand(trainer);
}

/** Narrows a database row to the shape the API is allowed to hand out. */
export function toPublicTrainer(trainer: TrainerModel): PublicTrainer {
  return {
    id: trainer.id,
    userId: trainer.userId,
    displayName: trainer.displayName,
    brandName: trainer.brandName,
    brandLogoUrl: brandLogoUrl(trainer),
    brandColor: trainer.brandColor,
    createdAt: trainer.createdAt.toISOString(),
    updatedAt: trainer.updatedAt.toISOString(),
  };
}
