import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

/**
 * A placeholder block shaped like the content that will replace it.
 *
 * Skeletons are decorative by definition — the surrounding region says what is
 * loading — so they are hidden from assistive technology rather than read out
 * as a run of empty boxes. The shimmer is behind `motion-safe`, so with
 * reduced motion the block is simply static and still visible.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('block rounded-control bg-border motion-safe:animate-pulse-soft', className)}
    />
  );
}

/**
 * Announces what is loading, once.
 *
 * Two details are load-bearing. The label is a real visually-hidden child, not
 * an `aria-label`: a live region is announced from its *contents*, and every
 * skeleton inside is `aria-hidden`, so a labelled-but-empty region would say
 * nothing at all. And there is deliberately no `aria-busy` here — on a live
 * region it tells assistive tech to withhold updates until it flips to false,
 * which never happens because the region is unmounted wholesale the moment
 * data lands. Together those two mistakes make a region that looks correct in
 * a DOM assertion and is silent in a screen reader.
 */
export function SkeletonRegion({
  label = 'Завантаження',
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
