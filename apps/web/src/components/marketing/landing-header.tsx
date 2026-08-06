import Link from 'next/link';

import { ThemeToggle } from '@/components/theme/theme-toggle';

const SECTIONS = [
  { href: '#khaos', label: 'Проблема' },
  { href: '#mozhlyvosti', label: 'Можливості' },
  { href: '#chomu-gart', label: 'Чому Gart' },
];

/**
 * The landing's own header — no session, no data fetching, nothing that would
 * drag auth machinery onto a public page. ThemeToggle is the one client island.
 *
 * The wordmark is set in the display face here rather than reusing the app's
 * component: on this page it is a masthead, not a UI control.
 *
 * Everything in the row can step aside, so the bar survives a 320px viewport —
 * the width WCAG 1.4.10 requires.
 */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-900/10 bg-paper/85 backdrop-blur dark:border-paper/15 dark:bg-ink-900/85">
      <div className="mx-auto flex h-16 max-w-[88rem] items-center gap-4 px-5 sm:gap-8 sm:px-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-display text-2xl font-bold uppercase tracking-[0.02em] text-ink-900 dark:text-paper"
        >
          Gart
          <span aria-hidden="true" className="ml-1 size-2 rounded-full bg-volt" />
        </Link>

        <nav aria-label="Розділи сторінки" className="hidden lg:block">
          <ul className="flex items-center gap-8">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <a
                  href={section.href}
                  className="inline-flex min-h-11 items-center font-display text-sm font-medium uppercase tracking-[0.08em] text-ink-600 transition-colors hover:text-ink-900 dark:text-paper/70 dark:hover:text-paper"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle align="start" />

          <Link
            href="/login"
            className="hidden min-h-11 items-center font-display text-sm font-medium uppercase tracking-[0.08em] text-ink-600 transition-colors hover:text-ink-900 sm:inline-flex dark:text-paper/70 dark:hover:text-paper"
          >
            Увійти
          </Link>

          <Link
            href="/register"
            className="inline-flex min-h-11 items-center rounded-full bg-ink-900 px-5 font-display text-sm font-bold uppercase tracking-[0.06em] text-paper transition-colors hover:bg-ink-600 dark:bg-volt dark:text-ink-900 dark:hover:bg-volt/85"
          >
            Спробувати
          </Link>
        </div>
      </div>
    </header>
  );
}
