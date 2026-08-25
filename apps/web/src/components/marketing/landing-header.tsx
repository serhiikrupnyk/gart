import Link from 'next/link';

import { Wordmark } from '@/components/layout/wordmark';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { buttonClasses } from '@/components/ui';
import { cx } from '@/lib/cx';
import { CtaLink } from './cta-link';

const SECTIONS = [
  { href: '#mozhlyvosti', label: 'Можливості' },
  { href: '#dlia-koho', label: 'Для кого' },
  { href: '#chomu-gart', label: 'Чому Gart' },
];

/**
 * The landing's own header — deliberately not the app shell: no session, no
 * data fetching, nothing that would drag auth machinery onto a public page.
 * ThemeToggle is the one client island.
 */
export function LandingHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 rounded-full border border-border/80 bg-surface/92 px-3 shadow-e3 backdrop-blur-xl sm:h-16 sm:px-5">
        <Wordmark href="/" />

        <nav aria-label="Розділи сторінки" className="hidden md:block">
          <ul className="flex items-center gap-7">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <a
                  href={section.href}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-text-secondary transition-colors hover:text-text"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-2">
          <ThemeToggle />
          <Link href="/login" className={cx(buttonClasses('ghost', 'md'), 'min-h-11')}>
            Увійти
          </Link>
          <CtaLink href="/register" size="md" className="min-h-10 px-4 sm:min-h-11 sm:px-5">
            Спробувати
          </CtaLink>
        </div>
      </div>
    </header>
  );
}
