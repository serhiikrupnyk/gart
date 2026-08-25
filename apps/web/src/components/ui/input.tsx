import type { LucideIcon } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';

import { cx } from '@/lib/cx';

export const CONTROL_BASE =
  'min-h-11 w-full rounded-control border bg-surface px-3.5 py-2.5 text-sm text-text shadow-e1 ' +
  'transition-[border-color,box-shadow,background-color] duration-200 ' +
  // Placeholders use text-secondary, not text-muted: muted is below AA.
  'placeholder:text-text-secondary disabled:cursor-not-allowed disabled:bg-bg-subtle ' +
  'disabled:text-text-muted focus:border-accent focus:shadow-[0_0_0_3px_rgb(255_91_50_/_0.1)]';

export function controlBorder(invalid: boolean): string {
  return invalid ? 'border-danger' : 'border-border-strong hover:border-text-muted';
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  invalid?: boolean;
  /**
   * Decorative mark inside the field. Purely presentational — the label still
   * names the control — so it is hidden from assistive technology. Leaving it
   * out renders exactly the markup this component produced before it existed.
   */
  leadingIcon?: LucideIcon;
}

export function Input({ invalid = false, leadingIcon: Icon, ...rest }: InputProps) {
  const field = (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx(CONTROL_BASE, controlBorder(invalid), Icon !== undefined && 'pl-10')}
    />
  );

  if (Icon === undefined) {
    return field;
  }

  return (
    <span className="relative block">
      <Icon
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2',
          rest.disabled === true ? 'text-text-muted' : 'text-text-secondary',
        )}
      />
      {field}
    </span>
  );
}
