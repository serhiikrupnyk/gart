import { cx } from '@/lib/cx';
import { ProgressLink } from './navigation-progress';

const TABS = [
  { href: '/dashboard/products', label: 'Продукти' },
  { href: '/dashboard/payments', label: 'Оплати' },
  { href: '/dashboard/subscriptions', label: 'Підписки' },
] as const;

/**
 * The «Платежі» sub-navigation, the shape WorkoutTabs established: real links
 * between routes, so plain anchors with aria-current rather than the ARIA tabs
 * pattern, which is for switching panels inside one page.
 *
 * Step 23 deliberately shipped no strip at all, because a one-tab strip is
 * chrome that says nothing. There are two now.
 */
export function PaymentTabs({ active }: { active: (typeof TABS)[number]['href'] }) {
  return (
    <nav
      aria-label="Розділи платежів"
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
                ? 'bg-accent-subtle text-accent-text shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]'
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
