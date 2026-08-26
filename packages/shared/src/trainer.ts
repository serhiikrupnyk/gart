/**
 * A trainer as exposed over the API. Each trainer is one-to-one with a
 * {@link PublicUser} and is the tenant that all future data hangs off.
 *
 * Optional columns are `| null` rather than `?` because that is what JSON
 * carries back from a nullable database column.
 */
export interface PublicTrainer {
  id: string;
  userId: string;
  displayName: string;
  brandName: string | null;
  /** Derived from the stored key — a Gart URL, never a trainer-supplied one. */
  brandLogoUrl: string | null;
  brandColor: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the trainer sees and edits on their own brand settings screen. */
export interface BrandSettings {
  displayName: string;
  brandName: string | null;
  brandLogoUrl: string | null;
  brandColor: string | null;
}

/**
 * A brand edit. `null` clears a field; an omitted field is left alone, so a
 * screen can save one control without having to resend the others.
 */
export interface UpdateBrandRequest {
  brandName?: string | null;
  brandColor?: string | null;
}

export const BRAND_NAME_MAX_LENGTH = 40;

/**
 * The only colour shape accepted, anywhere.
 *
 * `#RRGGBB` and nothing else — not `rgb()`, not a named colour, not shorthand.
 * The value ends up in a CSS `style` attribute, and the only safe policy for
 * something that reaches CSS is an exact-shape allowlist rather than a
 * blocklist of the payloads anyone thought of.
 */
export const BRAND_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isBrandColor(value: string): boolean {
  return BRAND_COLOR_PATTERN.test(value);
}

/**
 * The logo upload policy.
 *
 * Deliberately far smaller than a progress photo: a logo is a header mark, and
 * the cap is what keeps serving it through Gart (rather than from a public
 * bucket) cost nothing worth measuring.
 *
 * SVG is absent and must stay absent. It is the one image type that carries
 * script, and this is the one image we serve from our OWN origin — where a
 * script would run with our privileges rather than a storage host's.
 */
export const BRAND_LOGO_RULES = {
  contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxSizeBytes: 256 * 1024,
};
