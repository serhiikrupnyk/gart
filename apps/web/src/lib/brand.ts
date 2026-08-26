import type { CSSProperties } from 'react';
import { isBrandColor } from '@gart/shared';

import { API_URL } from './api';

/**
 * The one CSS variable a trainer's colour ever reaches, and its fallback.
 *
 * Every branded surface reads THIS rather than the raw value, so an unset brand
 * is not a special case anywhere: the app simply keeps its own accent.
 */
export const BRAND = 'var(--brand, var(--color-accent))';

/**
 * The style that puts a trainer's colour into the tree, or nothing.
 *
 * Re-validated here even though the API already validates on write. The value
 * arrives over the wire and ends up in a `style` attribute, and a string that
 * reaches CSS should be checked at the point it does so — not merely at the
 * point somebody last had the chance to.
 */
export function brandStyle(brandColor: string | null): CSSProperties | undefined {
  if (brandColor === null || !isBrandColor(brandColor)) {
    return undefined;
  }

  return { '--brand': brandColor } as CSSProperties;
}

/**
 * Where the browser actually fetches a logo from.
 *
 * The API hands back an origin-agnostic PATH, and the origin is applied here —
 * in ONE place, rather than at three call sites that each have to remember that
 * the API and the web app are different hosts and a bare path would resolve
 * against the wrong one. Should logos ever move behind a CDN, this is the
 * single line that changes.
 */
export function brandLogoSrc(brandLogoUrl: string | null): string | null {
  return brandLogoUrl === null ? null : `${API_URL}${brandLogoUrl}`;
}

/**
 * What to call this trainer in their client's app.
 *
 * `displayName` and never the literal «Gart»: a trainer who uploads a logo but
 * names no brand would otherwise get their own mark sitting beside our name,
 * which is worse than either brand alone.
 */
export function brandLabel(brand: { displayName: string; brandName: string | null }): string {
  return brand.brandName ?? brand.displayName;
}

/** Whether this trainer has set anything at all worth showing instead of Gart. */
export function hasBrand(brand: {
  brandName: string | null;
  brandLogoUrl: string | null;
  brandColor: string | null;
}): boolean {
  return brand.brandName !== null || brand.brandLogoUrl !== null || brand.brandColor !== null;
}
