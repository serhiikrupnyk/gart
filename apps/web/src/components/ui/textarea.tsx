import type { TextareaHTMLAttributes } from 'react';

import { cx } from '@/lib/cx';
import { CONTROL_BASE, controlBorder } from './input';

export interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'className'
> {
  invalid?: boolean;
}

export function Textarea({ invalid = false, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cx(CONTROL_BASE, controlBorder(invalid), 'resize-y')}
    />
  );
}
