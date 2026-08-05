import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

/**
 * Tinted rather than solid. The label uses each tone's `-text` step rather than
 * its fill: measured on their own tints the fills are 2.39–3.10 in light theme,
 * below AA at this size. See globals.css.
 */
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-bg-subtle text-text-secondary ring-border-strong',
  success: 'bg-success/10 text-success-text ring-success/30',
  warning: 'bg-warning/10 text-warning-text ring-warning/30',
  danger: 'bg-danger/10 text-danger-text ring-danger/30',
  accent: 'bg-accent-subtle text-accent-text ring-accent/30',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
