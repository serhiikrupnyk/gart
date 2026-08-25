import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

import { cx } from '@/lib/cx';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap ' +
  'transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out-expo ' +
  'motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 disabled:cursor-not-allowed ' +
  'disabled:opacity-50 disabled:hover:translate-y-0';

/**
 * Solid fills carry ink labels because white fails AA on the ember and on the
 * semantic colours; see globals.css. Solid hovers lighten rather than darken so
 * contrast rises rather than falls.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-contrast shadow-[0_8px_24px_rgb(255_91_50_/_0.2)] hover:bg-accent-solid-hover hover:shadow-[0_10px_30px_rgb(255_91_50_/_0.28)]',
  secondary:
    'border border-border-strong bg-surface text-text shadow-e1 hover:border-text-muted hover:bg-surface-raised hover:shadow-e2',
  ghost: 'text-text-secondary hover:bg-bg-subtle hover:text-text',
  danger: 'bg-danger text-on-danger shadow-e1 hover:opacity-90 hover:shadow-e2',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-xs',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-base',
};

/**
 * The visual recipe on its own, so a Link can wear it. Marketing CTAs are
 * links styled as buttons — nesting a <button> inside an <a> is invalid HTML.
 */
export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  fullWidth = false,
): string {
  return cx(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full');
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** Forwarded to the underlying <button>; React 19 treats it as a plain prop. */
  ref?: Ref<HTMLButtonElement>;
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
      className={buttonClasses(variant, size, fullWidth)}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
