import { cx } from '@/lib/cx';
import { ProgressLink } from './navigation-progress';

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
    <nav
      aria-label="Розділи тренувань"
      className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-control border border-border bg-surface p-1 shadow-e1"
    >
      {TABS.map((tab) => {
        const isActive = tab.href === active;

        return (
          <ProgressLink
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              'min-h-9 whitespace-nowrap rounded-[0.55rem] px-3.5 py-2 text-sm font-semibold transition-[color,background-color,box-shadow]',
              isActive
                ? 'bg-accent-subtle text-accent-text shadow-[inset_0_0_0_1px_rgb(255_91_50_/_0.12)]'
                : 'text-text-secondary hover:bg-bg-subtle hover:text-text',
            )}
          >
            {tab.label}
          </ProgressLink>
        );
      })}
    </nav>
  );
}
