import Link from 'next/link';

import { cx } from '@/lib/cx';

/**
 * The Gart wordmark. The dot is the ember spark from the brand concept — the
 * one place the accent appears at rest.
 */
export function Wordmark({
  href = '/',
  size = 'md',
  tone = 'default',
}: {
  href?: string;
  size?: 'md' | 'lg';
  tone?: 'default' | 'light';
}) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex min-h-11 items-baseline py-2.5 font-extrabold tracking-[-0.055em]',
        size === 'lg' ? 'text-2xl' : 'text-xl',
        tone === 'light' ? 'text-[#f7f6f2]' : 'text-text',
      )}
    >
      gart
      <span aria-hidden="true" className="ml-0.5 text-accent">
        .
      </span>
    </Link>
  );
}
