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
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 sm:px-6">
        <Wordmark href="/" />

        <nav aria-label="Розділи сторінки" className="hidden md:block">
          <ul className="flex items-center gap-6">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <a
                  href={section.href}
                  className="inline-flex min-h-11 items-center text-sm text-text-secondary transition-colors hover:text-text"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={cx(buttonClasses('ghost', 'md'), 'min-h-11')}>
            Увійти
          </Link>
          <CtaLink href="/register" size="md" className="min-h-11">
            Спробувати
          </CtaLink>
        </div>
      </div>
    </header>
  );
}
