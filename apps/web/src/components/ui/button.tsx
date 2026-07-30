import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from '@/lib/cx';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Solid fills carry ink labels because white fails AA on the ember and on the
 * semantic colours; see globals.css. Solid hovers lighten rather than darken so
 * contrast rises rather than falls.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-solid-hover',
  secondary: 'border border-border-strong bg-surface text-text hover:bg-bg-subtle',
  ghost: 'text-text-secondary hover:bg-bg-subtle hover:text-text',
  danger: 'bg-danger text-on-danger hover:opacity-90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction without collapsing the layout. */
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled = false,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full')}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
