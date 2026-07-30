import { cx } from '@/lib/cx';

const SIZES = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-8 border-[3px]',
} as const;

export interface SpinnerProps {
  size?: keyof typeof SIZES;
  /** Announced to assistive tech; omit when a nearby element already says it. */
  label?: string;
}

export function Spinner({ size = 'md', label }: SpinnerProps) {
  return (
    <span
      role={label === undefined ? 'presentation' : 'status'}
      aria-label={label}
      className={cx(
        'inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent',
        SIZES[size],
      )}
    />
  );
}
