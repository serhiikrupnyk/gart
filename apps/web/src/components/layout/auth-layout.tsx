import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Wordmark } from './wordmark';

export interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children?: ReactNode;
  footer?: ReactNode;
  /**
   * The line the brand panel carries on wide screens. Each screen says
   * something true about where the visitor is going — a trainer signing in is
   * not being sold to the way an invited client is being welcomed.
   */
  pitch?: ReactNode;
}

/**
 * The frame every unauthenticated screen sits in: a brand panel beside the
 * form on wide screens, the form alone on narrow ones.
 *
 * The panel is first in source order because that is where it is painted:
 * CSS `order` moves paint order only, never tab order, and a wordmark that
 * renders top-left but is the last tab stop is a trap for keyboard users. It
 * is not `aria-hidden` — it holds a real link — and it duplicates nothing,
 * because exactly one wordmark is in the tree at any width (the panel is
 * `display: none` below lg).
 */
export function AuthLayout({ title, subtitle, children, footer, pitch }: AuthLayoutProps) {
  return (
    <div className="relative min-h-dvh bg-bg-subtle lg:grid lg:grid-cols-2">
      <header className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </header>

      <aside className="relative hidden overflow-hidden border-r border-border bg-bg lg:flex lg:flex-col lg:items-start lg:justify-between lg:p-12">
        {/* The landing's ember, dimmed: this is a task screen, not a pitch. */}
        <div
          aria-hidden="true"
          className="absolute -left-24 bottom-0 size-96 rounded-full bg-accent/15 blur-3xl motion-safe:animate-ember"
        />

        <div className="relative">
          <Wordmark size="lg" href="/" />
        </div>

        {pitch !== undefined && <div className="relative max-w-sm">{pitch}</div>}

        <p className="relative text-xs text-text-secondary">
          Українська платформа для персональних тренерів
        </p>
      </aside>
      <main className="flex min-h-dvh flex-col justify-center px-4 py-12 lg:min-h-0">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Wordmark size="lg" />
          </div>

          <div className="rounded-card border border-border bg-surface p-6">
            <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
            <p className="mt-1.5 text-sm text-text-secondary">{subtitle}</p>

            {children}
          </div>

          {footer !== undefined && (
            <div className="mt-6 space-y-1 text-center text-sm text-text-secondary">{footer}</div>
          )}
        </div>
      </main>
    </div>
  );
}

/** The brand-panel line: a claim, then the sentence under it. */
export function AuthPitch({ headline, body }: { headline: string; body: string }) {
  return (
    <>
      <p className="text-2xl font-semibold tracking-tight text-text">{headline}</p>
      <p className="mt-3 text-sm text-text-secondary">{body}</p>
    </>
  );
}
