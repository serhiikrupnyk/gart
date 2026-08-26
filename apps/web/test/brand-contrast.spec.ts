import { BRAND_GLOW_PERCENT } from '@/components/layout/auth-layout';
import { BRAND_WASH_PERCENT } from '@/components/layout/client-shell';

import { AA_NORMAL_TEXT, composite, contrastRatio, parseHex, relativeLuminance } from './contrast';

/**
 * The tokens as globals.css actually defines them. Copied deliberately rather
 * than parsed: if somebody edits a token, this file should have to be edited
 * too, and the diff should show the contrast consequence being re-checked.
 */
const THEMES = {
  light: {
    bg: '#f7f6f2',
    bgSubtle: '#efeee8',
    surface: '#fffefa',
    text: '#171813',
    textSecondary: '#5f645a',
    accentText: '#c9320e',
    accentSubtle: '#ffede6',
  },
  dark: {
    bg: '#0c0e0d',
    bgSubtle: '#111411',
    surface: '#161a17',
    text: '#f5f5ef',
    textSecondary: '#a9b0a6',
    accentText: '#ff6a3d',
    accentSubtle: '#321b14',
  },
};

/**
 * The colours that bound the problem, plus a few a picker makes easy.
 *
 * Black and white are provably the worst cases and the only two that matter:
 * compositing is monotone per channel, luminance is monotone in each channel,
 * and every text luminance measured here lies outside the reachable range of
 * grounds — so the minimum contrast always falls at an endpoint of the brand
 * range, never in its interior. The rest are sampled for the record.
 */
const EXTREME_BRANDS = ['#000000', '#ffffff', '#808080', '#ff0000', '#0000ff'];

/**
 * The two places a trainer's colour touches a surface that text sits on, at
 * the densities the components actually use. Kept in step with
 * BRAND_WASH_PERCENT and BRAND_GLOW_PERCENT by importing them, so a component
 * edit cannot quietly drift out from under these measurements.
 */
const WASH_ALPHA = BRAND_WASH_PERCENT / 100;
const GLOW_ALPHA = BRAND_GLOW_PERCENT / 100;

/**
 * The dark auth panel the invite screen brands, and EVERY text colour on it.
 *
 * All three, not just the two that were comfortable. The panel's dimmest copy
 * used to be #777e75 and #5f655d, which measured 4.43 and 3.09 on the bare
 * panel — under AA before any brand touched them, and 2.57 and 1.80 beneath a
 * white brand's glow. A spec that measured only the passing colours would have
 * reported a panel «readable» while its smallest copy was not.
 */
const AUTH_PANEL = {
  bg: '#121411',
  text: '#f7f6f2',
  secondary: '#aeb4aa',
  dimmest: '#aeb4aa',
};

describe('the WCAG maths itself', () => {
  it('reproduces the reference values, so the measurements below mean something', () => {
    // A test that measured with a broken ruler would pass for the wrong reason.
    expect(relativeLuminance(parseHex('#ffffff'))).toBeCloseTo(1, 5);
    expect(relativeLuminance(parseHex('#000000'))).toBeCloseTo(0, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('composites the way a browser does', () => {
    expect(composite('#000000', '#ffffff', 0)).toBe('#ffffff');
    expect(composite('#000000', '#ffffff', 1)).toBe('#000000');
    expect(composite('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('can fail — a wash dense enough to break AA is caught', () => {
    // The mutation check for everything below: if the ruler could not detect a
    // genuinely bad wash, the passing assertions would prove nothing. At 60%
    // the ground moves far enough that body text must drop under AA.
    const ruined = composite('#000000', THEMES.light.bgSubtle, 0.6);

    expect(contrastRatio(THEMES.light.text, ruined)).toBeLessThan(AA_NORMAL_TEXT);
  });
});

describe('the brand wash keeps the client app readable', () => {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    for (const brand of EXTREME_BRANDS) {
      it(`${themeName}: body and secondary text stay AA over a ${brand} brand`, () => {
        const ground = composite(brand, theme.bgSubtle, WASH_ALPHA);

        // Measured, not assumed. The brand colour is the ONE place a trainer's
        // arbitrary choice touches a surface that text sits on, so this is the
        // only thing standing between a colour picker and an unreadable app.
        expect(contrastRatio(theme.text, ground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        expect(contrastRatio(theme.textSecondary, ground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${themeName}: the header and nav stay AA over a ${brand} brand`, () => {
        const ground = composite(brand, theme.bgSubtle, WASH_ALPHA);

        // The header is 80% opaque over the wash. The nav is measured at 75%,
        // its DESKTOP opacity, because that is the variant that actually sits
        // over the wash: the mobile bar is 92% but is pinned to the bottom of
        // the viewport, while the wash is a 20rem band at the top.
        const header = composite(theme.bg, ground, 0.8);
        const navPanel = composite(theme.surface, ground, 0.75);

        expect(contrastRatio(theme.text, header)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        expect(contrastRatio(theme.textSecondary, navPanel)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);

        // The ACTIVE nav label sits on an opaque accent tint, so the wash never
        // reaches it — asserted so the claim is on the record, not assumed.
        expect(contrastRatio(theme.accentText, theme.accentSubtle)).toBeGreaterThanOrEqual(
          AA_NORMAL_TEXT,
        );
      });
    }
  }
});

describe('the branded invite panel keeps its copy readable', () => {
  for (const brand of EXTREME_BRANDS) {
    it(`stays AA over a ${brand} brand glow`, () => {
      // A client's first impression, and the one unauthenticated screen that
      // wears a trainer's colour. The glow is large and the panel's copy sits
      // over it, so this is measured at the glow's full density.
      const ground = composite(brand, AUTH_PANEL.bg, GLOW_ALPHA);

      expect(contrastRatio(AUTH_PANEL.text, ground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastRatio(AUTH_PANEL.secondary, ground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastRatio(AUTH_PANEL.dimmest, ground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);

      // And on the bare panel, away from the glow entirely.
      expect(contrastRatio(AUTH_PANEL.dimmest, AUTH_PANEL.bg)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    });
  }
});
