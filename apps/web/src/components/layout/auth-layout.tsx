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
 * form on wide screens and a compact brand stage behind it on narrow ones.
 *
 * The panel is first in source order because that is where it is painted:
 * CSS `order` moves paint order only, never tab order, and a wordmark that
 * renders top-left but is the last tab stop is a trap for keyboard users. It
 * is not `aria-hidden` — it holds a real link — and it duplicates nothing,
 * because exactly one wordmark is in the tree at every width.
 */
export function AuthLayout({ title, subtitle, children, footer, pitch }: AuthLayoutProps) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#121411] lg:grid lg:grid-cols-[minmax(28rem,1.08fr)_minmax(30rem,0.92fr)]">
      <header className="absolute right-4 top-3 z-30 sm:right-6 sm:top-6 lg:fixed lg:right-7 lg:top-7">
        <ThemeToggle tone="inverted" />
      </header>

      <aside className="relative flex min-h-[22rem] flex-col items-start justify-between overflow-hidden bg-[#121411] px-5 pb-24 pt-4 sm:min-h-[25rem] sm:px-8 sm:pb-28 sm:pt-7 lg:min-h-dvh lg:p-12 xl:p-16">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #f7f6f2 1px, transparent 1px), linear-gradient(to bottom, #f7f6f2 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-28 -left-24 size-[34rem] rounded-full bg-accent/30 blur-[100px] motion-safe:animate-ember"
        />
        <span
          aria-hidden="true"
          className="absolute -right-12 top-20 size-60 rounded-full border border-white/10 sm:right-10 sm:size-64 lg:-right-20 lg:top-[12%] lg:size-[26rem]"
        />
        <span
          aria-hidden="true"
          className="absolute right-4 top-32 size-36 rounded-full border border-accent/50 sm:right-24 sm:size-40 lg:right-4 lg:top-[21%] lg:size-[18rem]"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-7 right-4 text-[6rem] font-extrabold leading-none tracking-[-0.09em] text-white/[0.035] sm:text-[9rem] lg:-bottom-8 lg:-right-3 lg:text-[18rem]"
        >
          GART
        </span>

        <div className="relative">
          <Wordmark size="lg" href="/" tone="light" />
          <p className="mt-1 text-[0.58rem] font-bold uppercase tracking-[0.24em] text-[#777e75]">
            Private coaching OS
          </p>
        </div>

        {pitch !== undefined ? (
          <div className="relative max-w-[19rem] sm:max-w-lg lg:max-w-[38rem]">{pitch}</div>
        ) : (
          <p className="relative max-w-[15rem] text-2xl font-bold leading-tight tracking-[-0.04em] text-[#f7f6f2] lg:text-4xl">
            Ваш простір для сильнішої роботи.
          </p>
        )}

        <div className="relative hidden w-full items-end justify-between lg:flex">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#aeb4aa]">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
              Створено для українських тренерів
            </div>
            <p className="text-xs text-[#777e75]">Програми · Прогрес · Звички · Чат</p>
          </div>
          <span className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-[#5f655d]">
            01 / Access
          </span>
        </div>
      </aside>
      <main className="relative z-10 -mt-14 flex min-h-[calc(100dvh-18rem)] flex-col justify-start rounded-t-[2.75rem] bg-bg-subtle px-4 pb-10 pt-7 shadow-[0_-20px_60px_rgb(0_0_0_/_0.16)] sm:-mt-16 sm:min-h-[calc(100dvh-21rem)] sm:px-8 sm:pt-9 lg:m-3 lg:min-h-[calc(100dvh-1.5rem)] lg:justify-center lg:rounded-[2.75rem] lg:px-12 lg:py-12 lg:shadow-e4">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 bottom-8 hidden text-[7rem] font-extrabold leading-none tracking-[-0.08em] text-border/35 xl:block"
        >
          ACCESS
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-10 top-10 hidden size-2 rounded-full bg-accent shadow-[0_0_0_8px_rgb(255_91_50_/_0.1)] lg:block"
        />

        <div className="relative mx-auto w-full max-w-md">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-surface p-5 shadow-e4 before:absolute before:inset-y-10 before:left-0 before:w-1 before:rounded-r-full before:bg-accent sm:p-8 lg:rounded-[2rem] lg:p-9">
            <div className="mb-6 flex items-center justify-between gap-4">
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-accent-text">
                Gart account
              </span>
              <span className="inline-flex items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-text-muted">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
                Захищений простір
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.04em] text-text sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{subtitle}</p>

            {children}
          </div>

          {footer !== undefined && (
            <div className="mt-6 space-y-2 text-center text-sm leading-relaxed text-text-secondary">
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** The brand-panel line: a claim, then the sentence under it. */
export function AuthPitch({ headline, body }: { headline: string; body: string }) {
  return (
    <div>
      <span aria-hidden="true" className="mb-5 block h-px w-14 bg-accent" />
      <p className="text-[2.15rem] font-bold leading-[0.98] tracking-[-0.06em] text-[#f7f6f2] sm:text-[2.8rem] lg:text-[clamp(3.25rem,5.3vw,5.8rem)]">
        {headline}
      </p>
      <p className="mt-4 max-w-sm text-xs leading-relaxed text-[#aeb4aa] sm:mt-5 sm:text-sm lg:text-base">
        {body}
      </p>
    </div>
  );
}
