'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cx } from '@/lib/cx';

interface NavItem {
  label: string;
  href?: string;
}

/**
 * Sections without an href are visible but not yet built. Showing them as
 * disabled rather than hiding them tells the trainer what is coming; they are
 * rendered as plain text so keyboard users never land on a dead control.
 */
const ITEMS: NavItem[] = [
  { label: 'Клієнти', href: '/dashboard' },
  { label: 'Тренування' },
  { label: 'Прогрес' },
  { label: 'Платежі' },
];

export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Основна навігація">
      <ul className="space-y-0.5">
        {ITEMS.map((item) => {
          if (item.href === undefined) {
            return (
              <li key={item.label}>
                <span className="flex items-center justify-between rounded-control px-3 py-2 text-sm text-text-muted">
                  {item.label}
                  <span className="text-2xs uppercase tracking-wide">скоро</span>
                </span>
              </li>
            );
          }

          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cx(
                  'block rounded-control px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-accent-subtle text-accent'
                    : 'text-text-secondary hover:bg-bg-subtle hover:text-text',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
