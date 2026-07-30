import Link from 'next/link';

import { cx } from '@/lib/cx';

/**
 * The Gart wordmark. The dot is the ember spark from the brand concept — the
 * one place the accent appears at rest.
 */
export function Wordmark({ href = '/', size = 'md' }: { href?: string; size?: 'md' | 'lg' }) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex items-baseline font-semibold tracking-tight text-text',
        size === 'lg' ? 'text-2xl' : 'text-lg',
      )}
    >
      gart
      <span aria-hidden="true" className="ml-0.5 text-accent">
        .
      </span>
    </Link>
  );
}
