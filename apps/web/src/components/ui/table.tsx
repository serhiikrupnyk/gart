import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

export function Table({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    // The scroll container is focusable and named on purpose. A wide table
    // overflows here rather than on the page, and Chrome and Firefox make such
    // a scroller keyboard-reachable implicitly — WebKit does not. Without the
    // tabIndex, a Safari keyboard user cannot bring the off-screen columns into
    // view at all, and on a payments table those columns are the whole point.
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-panel border border-border bg-surface shadow-e1"
    >
      <table className="w-full border-collapse text-left text-sm">
        {/* Every table needs a caption for screen readers; hidden visually. */}
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  // No sticky option: Table's wrapper is `overflow-x-auto`, which makes it the
  // sticky scrollport (overflow-x: auto forces overflow-y to compute to auto).
  // It has no height constraint, so it never scrolls vertically and a sticky
  // thead inside it would silently do nothing. Making one work means changing
  // how Table scrolls, which is a wider change than a header deserves.
  return <thead className="border-b border-border bg-bg-subtle/70">{children}</thead>;
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border/80">{children}</tbody>;
}

export function Tr({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** Extra row classes — e.g. `group` so cells can react to row hover. */
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cx(
        onClick !== undefined && 'cursor-pointer transition-colors hover:bg-bg-subtle/70',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Th({ children, numeric = false }: { children: ReactNode; numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cx(
        'px-4 py-3.5 text-2xs font-bold uppercase tracking-[0.08em] text-text-secondary sm:px-5',
        numeric && 'text-right',
      )}
    >
      {children}
    </th>
  );
}

/**
 * `numeric` right-aligns as well as setting tabular figures.
 *
 * Tabular figures line digits up WITHIN a row; they do nothing across rows of
 * different magnitude. Left-aligned, «7» above «120» puts the units in
 * different places, so a column cannot be scanned for size at a glance.
 */
export function Td({ children, numeric = false }: { children: ReactNode; numeric?: boolean }) {
  return (
    <td className={cx('px-4 py-4 text-text sm:px-5', numeric && 'tabular text-right')}>
      {children}
    </td>
  );
}
