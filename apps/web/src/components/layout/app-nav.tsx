'use client';

import { usePathname } from 'next/navigation';
import {
  ChartNoAxesCombined,
  Dumbbell,
  LayoutDashboard,
  Palette,
  Utensils,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

import { cx } from '@/lib/cx';
import { ProgressLink } from './navigation-progress';

interface NavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  /** Paths that light this item up besides its own href (sub-areas). */
  activeUnder?: string[];
}

/**
 * Sections without an href are visible but not yet built. Showing them as
 * disabled rather than hiding them tells the trainer what is coming; they are
 * rendered as plain text so keyboard users never land on a dead control.
 */
const ITEMS: NavItem[] = [
  { label: 'Клієнти', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Тренування',
    href: '/dashboard/programs',
    activeUnder: ['/dashboard/programs', '/dashboard/exercises'],
    icon: Dumbbell,
  },
  { label: 'Прогрес', icon: ChartNoAxesCombined },
  { label: 'Харчування', href: '/dashboard/nutrition', icon: Utensils },
  { label: 'Платежі', href: '/dashboard/billing', icon: WalletCards },
  { label: 'Бренд', href: '/dashboard/brand', icon: Palette },
];

export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  // The longest matching href wins: /dashboard is a prefix of every section, so
  // a plain startsWith would light «Клієнти» up on /dashboard/exercises too.
  const activeHref = ITEMS.filter((item): item is NavItem & { href: string } => {
    if (item.href === undefined) return false;

    const paths = item.activeUnder ?? [item.href];
    return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  }).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Основна навігація" className="flex h-full flex-col">
      <p className="mb-3 px-3 text-2xs font-bold uppercase tracking-[0.16em] text-text-muted">
        Робочий простір
      </p>
      <ul className="space-y-1.5">
        {ITEMS.map((item) => {
          const Icon = item.icon;

          if (item.href === undefined) {
            return (
              <li key={item.label}>
                <span className="flex min-h-12 items-center gap-3 rounded-control px-3 text-sm text-text-muted">
                  <span className="inline-flex size-8 items-center justify-center rounded-[0.6rem] bg-bg-subtle">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span>{item.label}</span>
                  <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide">
                    скоро
                  </span>
                </span>
              </li>
            );
          }

          const active = item.href === activeHref;

          return (
            <li key={item.label}>
              <ProgressLink
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cx(
                  'group flex min-h-12 items-center gap-3 rounded-control px-3 text-sm font-semibold transition-[color,background-color,box-shadow] duration-200',
                  active
                    ? 'bg-accent-subtle text-accent-text shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]'
                    : 'text-text-secondary hover:bg-bg-subtle hover:text-text',
                )}
              >
                <span
                  className={cx(
                    'inline-flex size-8 items-center justify-center rounded-[0.6rem] transition-colors',
                    active
                      ? 'bg-accent text-accent-contrast shadow-e1'
                      : 'bg-bg-subtle text-text-secondary group-hover:bg-surface',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span>{item.label}</span>
              </ProgressLink>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto hidden rounded-card border border-border bg-bg-subtle p-4 lg:block">
        <span aria-hidden="true" className="mb-3 block size-2 rounded-full bg-accent" />
        <p className="text-xs font-bold text-text">Ваш простір для росту</p>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
          Усі клієнти, плани й результати — в одному ритмі.
        </p>
      </div>
    </nav>
  );
}
