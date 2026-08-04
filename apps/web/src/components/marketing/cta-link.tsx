import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonClasses, type ButtonSize, type ButtonVariant } from '@/components/ui';

/**
 * A link wearing the button recipe. The landing's CTAs navigate — they are
 * links, not actions — and a <button> inside an <a> is invalid HTML, so this
 * borrows the exact classes instead of the component.
 */
export function CtaLink({
  href,
  variant = 'primary',
  size = 'lg',
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses(variant, size)}>
      {children}
    </Link>
  );
}
