'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

export interface DropdownMenuProps {
  /** The button contents. The trigger element itself is provided for you. */
  trigger: ReactNode;
  triggerLabel: string;
  children: (close: () => void) => ReactNode;
}

/**
 * A menu button per the WAI-ARIA pattern: Esc closes and returns focus, a click
 * outside dismisses, and the trigger reports its expanded state.
 */
export function DropdownMenu({ trigger, triggerLabel, children }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="flex items-center gap-2 rounded-control px-1.5 py-1 transition-colors hover:bg-bg-subtle"
      >
        {trigger}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-1.5 min-w-48 rounded-card border border-border bg-surface-raised p-1 shadow-lg"
        >
          {children(() => {
            setOpen(false);
          })}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-[0.375rem] px-3 py-2 text-left text-sm text-text transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:text-text-muted"
    >
      {children}
    </button>
  );
}
