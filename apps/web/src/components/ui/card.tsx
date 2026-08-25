import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

export interface CardProps {
  children: ReactNode;
  /** `raised` reads as elevated in dark theme, where surfaces stack. */
  tone?: 'surface' | 'raised';
  padded?: boolean;
}

export function Card({ children, tone = 'surface', padded = true }: CardProps) {
  return (
    <div
      className={cx(
        'rounded-card border border-border shadow-e1',
        tone === 'raised' ? 'bg-surface-raised' : 'bg-surface',
        padded && 'p-5 sm:p-6',
      )}
    >
      {children}
    </div>
  );
}
