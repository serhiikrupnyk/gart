import type { InputHTMLAttributes } from 'react';

import { cx } from '@/lib/cx';

export const CONTROL_BASE =
  'w-full rounded-control border bg-surface px-3 py-2 text-sm text-text transition-colors ' +
  // Placeholders use text-secondary, not text-muted: muted is below AA.
  'placeholder:text-text-secondary disabled:cursor-not-allowed disabled:bg-bg-subtle ' +
  'disabled:text-text-muted';

export function controlBorder(invalid: boolean): string {
  return invalid ? 'border-danger' : 'border-border-strong hover:border-text-muted';
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  invalid?: boolean;
}

export function Input({ invalid = false, ...rest }: InputProps) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx(CONTROL_BASE, controlBorder(invalid))}
    />
  );
}
