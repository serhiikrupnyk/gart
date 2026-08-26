import {
  BRAND_LOGO_RULES,
  type BrandSettings,
  type PresignMediaResponse,
  type UpdateBrandRequest,
} from '@gart/shared';

import { apiFetch } from './api';
import { uploadToStorage } from './upload';

export function getBrand(): Promise<BrandSettings> {
  return apiFetch<BrandSettings>('/trainer/brand');
}

export function updateBrand(body: UpdateBrandRequest): Promise<BrandSettings> {
  return apiFetch<BrandSettings>('/trainer/brand', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function removeBrandLogo(): Promise<BrandSettings> {
  return apiFetch<BrandSettings>('/trainer/brand/logo', { method: 'DELETE' });
}

/** Local pre-check, so an obviously wrong file is refused before any round trip. */
export function checkLogoFile(file: File): string | undefined {
  if (!BRAND_LOGO_RULES.contentTypes.includes(file.type)) {
    return 'Підійде JPEG, PNG або WebP';
  }
  if (file.size > BRAND_LOGO_RULES.maxSizeBytes) {
    return `Файл завеликий — до ${String(Math.round(BRAND_LOGO_RULES.maxSizeBytes / 1024))} КБ`;
  }

  return undefined;
}

/**
 * The Step 8 upload, unchanged: presign, PUT straight to storage, then finalize
 * so the API verifies what actually landed before it is recorded.
 *
 * No progress is reported and none is accepted. `uploadToStorage` offers it
 * because an exercise video needs it; a logo is capped at 256 KB, where a
 * progress bar would be a control that reaches 100% before it has rendered.
 * The button's pending state is the whole affordance.
 */
export async function uploadBrandLogo(file: File): Promise<BrandSettings> {
  const { uploadUrl, key } = await apiFetch<PresignMediaResponse>('/trainer/brand/logo/presign', {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
  });

  await uploadToStorage(uploadUrl, file, () => undefined);

  return apiFetch<BrandSettings>('/trainer/brand/logo/finalize', {
    method: 'POST',
    body: JSON.stringify({ key }),
  });
}
