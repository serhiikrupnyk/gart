import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonClasses, type ButtonSize, type ButtonVariant } from '@/components/ui';
import { cx } from '@/lib/cx';

/**
 * A link wearing the button recipe. The landing's CTAs navigate — they are
 * links, not actions — and a <button> inside an <a> is invalid HTML, so this
 * borrows the exact classes instead of the component.
 */
export function CtaLink({
  href,
  variant = 'primary',
  size = 'lg',
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cx(buttonClasses(variant, size), className)}>
      {children}
    </Link>
  );
}
