'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

import { Button } from './button';
import { useFocusTrap } from './use-focus-trap';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Rendered bottom-right; typically the confirm and cancel buttons. */
  footer?: ReactNode;
  /** `lg` for forms that need room; default fits confirmations and short forms. */
  size?: 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Opening focus goes to the first control in the body, so a form dialog lands
  // on its first field rather than on the close button.
  useFocusTrap(dialogRef, open, bodyRef);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    // Nothing behind the modal should scroll while it is up.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      {/* Clicking away is a convenience; Esc and the close button are the
          accessible paths, so the backdrop is hidden from assistive tech. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-[#090b09]/70 backdrop-blur-[6px]"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative max-h-[92dvh] w-full overflow-hidden ${size === 'lg' ? 'max-w-2xl' : 'max-w-md'} rounded-t-panel border border-border bg-surface-raised shadow-e4 outline-none sm:rounded-panel`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
          <h2 id={titleId} className="text-lg font-bold text-text">
            {title}
          </h2>

          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Закрити">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div ref={bodyRef} className="max-h-[calc(92dvh-9rem)] overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>

        {footer !== undefined && (
          <div className="flex justify-end gap-2 border-t border-border bg-bg-subtle/50 px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
