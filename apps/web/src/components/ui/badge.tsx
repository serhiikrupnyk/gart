import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

/**
 * Tinted rather than solid, so the label keeps the full-strength text colour and
 * comfortably clears AA — a solid semantic fill at this size would not.
 */
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-bg-subtle text-text-secondary ring-border-strong',
  success: 'bg-success/10 text-success ring-success/30',
  warning: 'bg-warning/10 text-warning ring-warning/30',
  danger: 'bg-danger/10 text-danger ring-danger/30',
  accent: 'bg-accent-subtle text-accent ring-accent/30',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
