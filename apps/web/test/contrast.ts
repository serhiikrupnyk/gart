/**
 * Contrast measurement, for the claims about a trainer's arbitrary brand colour
 * that would otherwise be assertions of good intent.
 *
 * Test infrastructure and not shipped code: the app's own guarantee is
 * STRUCTURAL — a brand colour never carries text and never becomes a ground
 * that text sits on — so nothing at runtime needs to compute a ratio. What
 * runtime cannot prove is that the one place brand colour does touch a
 * text-bearing surface, the ambient wash, stays above AA at every possible
 * choice. That is what this measures.
 *
 * WCAG 2.1 relative luminance and contrast ratio, verbatim from the spec.
 */

export type Rgb = readonly [number, number, number];

export function parseHex(hex: string): Rgb {
  const value = hex.trim().replace('#', '');

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Not a #RRGGBB colour: ${hex}`);
  }

  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

/**
 * WCAG 2.1 relative luminance.
 *
 * The threshold is 0.04045, the sRGB transfer function's own value, where the
 * WCAG 2.1 text says 0.03928. Swept across all 256 eight-bit channel values the
 * two differ by exactly zero, and every input here is eight-bit because
 * `composite` rounds to hex — so the choice is unobservable. Noted rather than
 * silently «corrected», since the discrepancy is in the spec, not here.
 */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;

    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as unknown as Rgb;

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 §contrast ratio — 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(parseHex(a));
  const second = relativeLuminance(parseHex(b));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return (lighter + 0.05) / (darker + 0.05);
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * `over` painted on `under` at `alpha`, exactly as a browser composites it.
 *
 * Gamma-encoded sRGB channels, because that is what simple alpha compositing
 * operates on — not linear light. This models
 * `color-mix(in srgb, C <p>%, transparent)` layered over a ground: mixing with
 * `transparent` is premultiplied, so the result is C at alpha p, and painting
 * that over the ground is the interpolation below.
 */
export function composite(over: string, under: string, alpha: number): string {
  const front = parseHex(over);
  const back = parseHex(under);

  return toHex([
    front[0] * alpha + back[0] * (1 - alpha),
    front[1] * alpha + back[1] * (1 - alpha),
    front[2] * alpha + back[2] * (1 - alpha),
  ] as unknown as Rgb);
}

/** WCAG AA for body text. Large text is 3:1; nothing here relies on that. */
export const AA_NORMAL_TEXT = 4.5;
