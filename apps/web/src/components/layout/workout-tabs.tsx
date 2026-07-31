import Link from 'next/link';

import { cx } from '@/lib/cx';

const TABS = [
  { href: '/dashboard/programs', label: 'Програми' },
  { href: '/dashboard/exercises', label: 'Бібліотека вправ' },
] as const;

/**
 * The «Тренування» sub-navigation: real links between routes, so plain anchors
 * with aria-current rather than the ARIA tabs pattern (which is for switching
 * panels inside one page). Step 12 adds assignments here.
 */
export function WorkoutTabs({ active }: { active: (typeof TABS)[number]['href'] }) {
  return (
    <nav aria-label="Розділи тренувань" className="mb-6 flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const isActive = tab.href === active;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-accent text-text'
                : 'border-transparent text-text-secondary hover:text-text',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
