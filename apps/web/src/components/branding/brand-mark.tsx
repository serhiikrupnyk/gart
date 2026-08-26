import { BRAND, brandLabel, brandLogoSrc } from '@/lib/brand';
import { cx } from '@/lib/cx';

export interface BrandMarkProps {
  displayName: string;
  brandName: string | null;
  brandLogoUrl: string | null;
  brandColor: string | null;
  /** `lg` for the first-impression screens; `md` for the app header. */
  size?: 'md' | 'lg';
  /** Light text for the dark auth panel; default is the themed app palette. */
  tone?: 'default' | 'light';
}

/**
 * A trainer's brand, wherever their client sees it.
 *
 * The colour is DECORATIVE ONLY, which here is a structural fact rather than a
 * promise: it appears as a dot and a ring and never as a text colour or as a
 * ground that text sits on. The label beside it always uses an AA-measured
 * token, so no colour a trainer can pick changes whether their client can read
 * their name.
 *
 * The hairline ring is not styling. A brand colour close to the surface it sits
 * on — white in light theme, near-black in dark — would otherwise vanish, which
 * WCAG permits for a decorative mark but which reads as a broken image. The
 * ring means the mark is always delineated whatever the colour.
 */
export function BrandMark({
  displayName,
  brandName,
  brandLogoUrl,
  brandColor,
  size = 'md',
  tone = 'default',
}: BrandMarkProps) {
  const large = size === 'lg';

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {brandLogoUrl !== null && (
        // Plain <img>: the source is a Gart route that streams the stored
        // object, already small and already cached immutably, so next/image
        // would only add a re-encoding hop.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brandLogoSrc(brandLogoUrl) ?? undefined}
          alt=""
          className={cx(
            'shrink-0 rounded-full object-cover ring-1 ring-inset',
            large ? 'size-10' : 'size-7',
            tone === 'light' ? 'ring-white/20' : 'ring-black/10',
          )}
        />
      )}

      {brandColor !== null && (
        <span
          aria-hidden="true"
          data-testid="brand-dot"
          className={cx(
            'shrink-0 rounded-full ring-1 ring-inset',
            large ? 'size-3' : 'size-2',
            tone === 'light' ? 'ring-white/25' : 'ring-black/15',
          )}
          style={{ backgroundColor: BRAND }}
        />
      )}

      <span
        className={cx(
          'truncate font-bold tracking-[-0.03em]',
          large ? 'text-2xl' : 'text-lg',
          tone === 'light' ? 'text-[#f7f6f2]' : 'text-text',
        )}
      >
        {brandLabel({ displayName, brandName })}
      </span>
    </span>
  );
}
