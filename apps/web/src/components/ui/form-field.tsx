'use client';

import { type ReactNode, useId } from 'react';

import { Label } from './label';

export interface FormFieldProps {
  label: string;
  /** Rendered with the id and aria wiring already applied. */
  children: (props: {
    id: string;
    'aria-describedby': string | undefined;
    invalid: boolean;
  }) => ReactNode;
  error?: string | undefined;
  hint?: string | undefined;
}

/**
 * Owns the label/control/message relationship so no screen can get the aria
 * wiring wrong: the control receives its id, `aria-invalid` when errored, and
 * `aria-describedby` pointing at whichever messages are actually present.
 */
export function FormField({ label, children, error, hint }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy =
    [error !== undefined && errorId, hint !== undefined && hintId].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>

      <div className="mt-1.5">
        {children({ id, 'aria-describedby': describedBy, invalid: error !== undefined })}
      </div>

      {hint !== undefined && (
        <p id={hintId} className="mt-1.5 text-xs text-text-secondary">
          {hint}
        </p>
      )}

      {error !== undefined && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
