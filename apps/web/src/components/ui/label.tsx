import type { LabelHTMLAttributes, ReactNode } from 'react';

export interface LabelProps extends Omit<LabelHTMLAttributes<HTMLLabelElement>, 'className'> {
  children: ReactNode;
}

export function Label({ children, ...rest }: LabelProps) {
  return (
    <label {...rest} className="block text-sm font-semibold text-text">
      {children}
    </label>
  );
}
