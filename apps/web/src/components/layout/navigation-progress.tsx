'use client';

import Link from 'next/link';
import { useLinkStatus } from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Why this exists rather than a `loading.tsx` boundary: every page in this app
 * is a client component that fetches in an effect. The server segment renders
 * instantly, so a route-level loading boundary would flash for a few
 * milliseconds and then hand over to a page that is *still* fetching — the
 * real wait would go unindicated. `useLinkStatus` reports the navigation
 * itself, which is the part a top bar should track.
 */

let pendingCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function isPending(): boolean {
  return pendingCount > 0;
}

/** The server renders no bar; the first client pass settles it. */
function neverPending(): boolean {
  return false;
}

function setPending(pending: boolean): () => void {
  if (!pending) {
    return () => undefined;
  }

  pendingCount += 1;
  emit();

  // Decrementing on cleanup rather than on a "finished" event is what keeps the
  // count honest when a navigation is abandoned midway.
  return () => {
    pendingCount -= 1;
    emit();
  };
}

/** Lives inside a <Link>, where `useLinkStatus` is allowed to read its state. */
function PendingReporter() {
  const { pending } = useLinkStatus();

  useEffect(() => setPending(pending), [pending]);

  return null;
}

/**
 * A Link that contributes to the top bar. Used for navigation between pages;
 * ordinary links that stay on the page need no reporter.
 */
export function ProgressLink({
  children,
  ...rest
}: ComponentProps<typeof Link> & { children: ReactNode }) {
  return (
    <Link {...rest}>
      {children}
      <PendingReporter />
    </Link>
  );
}

/**
 * The bar itself: one per app shell, fixed to the top. It is `aria-hidden`
 * because a route change already moves focus and announces the new page —
 * a live region here would double-announce every navigation.
 */
export function NavigationProgress() {
  const pending = useSyncExternalStore(subscribe, isPending, neverPending);

  if (!pending) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5 overflow-hidden bg-accent/15"
    >
      <div className="h-full w-1/3 origin-left bg-accent motion-safe:w-full motion-safe:animate-indeterminate" />
    </div>
  );
}
