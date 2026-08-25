import { cx } from '@/lib/cx';

const SIZES = {
  sm: 'size-7 text-xs',
  md: 'size-9 text-sm',
} as const;

export interface AvatarProps {
  name: string;
  size?: keyof typeof SIZES;
}

/** First letter of each of the first two words, uppercased. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function Avatar({ name, size = 'md' }: AvatarProps) {
  return (
    <span
      // Decorative: the name is always rendered as text next to it.
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-accent/20 bg-gradient-to-br from-accent-subtle to-surface-raised font-bold text-accent-text shadow-e1',
        SIZES[size],
      )}
    >
      {initials(name)}
    </span>
  );
}
