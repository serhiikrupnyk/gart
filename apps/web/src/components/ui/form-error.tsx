'use client';

import { CircleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';

/**
 * A form-level failure message.
 *
 * It takes focus when it appears, because submitting disables the button the
 * user was standing on — and a disabled element is blurred, dropping focus to
 * <body>. Without this, a keyboard user who submits and fails is returned to
 * the top of the document with no idea what happened. `tabIndex={-1}` makes
 * the message focusable programmatically without adding a tab stop.
 *
 * `role="alert"` still announces the text; the icon carries the meaning that
 * colour alone would otherwise have to.
 */
export function FormError({ children }: { children: string }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <p
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex items-start gap-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger-text"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}
