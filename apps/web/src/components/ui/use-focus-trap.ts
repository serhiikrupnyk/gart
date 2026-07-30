'use client';

import { type RefObject, useEffect } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Deliberately does not test layout. `offsetParent` would seem the obvious
 * visibility check, but it is null for `position: fixed` elements in real
 * browsers and for everything in jsdom — either way it drops targets that
 * should be reachable. Attribute-based hiding is what actually matters here.
 */
function focusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.closest('[hidden], [aria-hidden="true"]') === null,
  );
}

/**
 * Keeps Tab inside `container` while `active`, and restores focus to whatever
 * was focused before on unmount.
 *
 * `initialFocus` narrows where the opening focus lands — for a form dialog that
 * is the first field, not the close button that happens to come first in the
 * DOM. The trap itself still spans the whole container.
 *
 * Written by hand rather than relying on a native <dialog>: jsdom does not
 * implement `showModal()`, so the browser's own trap could not be covered by a
 * test. This one can be.
 */
export function useFocusTrap(
  container: RefObject<HTMLElement | null>,
  active: boolean,
  initialFocus?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    const root = container.current;

    if (root === null) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const preferred = initialFocus?.current;

    (
      (preferred === null || preferred === undefined ? undefined : focusable(preferred)[0]) ??
      focusable(root)[0] ??
      root
    ).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const targets = focusable(root);

      if (targets.length === 0) {
        event.preventDefault();
        return;
      }

      const first = targets[0];
      const last = targets[targets.length - 1];

      if (first === undefined || last === undefined) {
        return;
      }

      const current = document.activeElement;

      // The container itself is only focused when it holds nothing focusable,
      // but treat it as "before the first" so Shift+Tab still wraps.
      if (event.shiftKey && (current === first || current === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || current === root)) {
        event.preventDefault();
        first.focus();
      } else if (current instanceof Node && !root.contains(current)) {
        // Focus escaped — for instance because something outside called focus().
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [container, active, initialFocus]);
}
