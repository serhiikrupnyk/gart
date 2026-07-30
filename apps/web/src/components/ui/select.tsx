import type { SelectHTMLAttributes } from 'react';

import { cx } from '@/lib/cx';
import { CONTROL_BASE, controlBorder } from './input';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  options: readonly SelectOption[];
  invalid?: boolean;
}

/**
 * A native <select>. Deliberately not a custom listbox: the native control is
 * keyboard-accessible, screen-reader correct and uses the platform picker on
 * touch devices for free.
 */
export function Select({ options, invalid = false, ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx(CONTROL_BASE, controlBorder(invalid), 'appearance-none pr-8')}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
