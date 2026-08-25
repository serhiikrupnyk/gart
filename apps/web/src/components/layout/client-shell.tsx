'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import type { ClientSession } from '@gart/shared';
import { ChartNoAxesCombined, Dumbbell, MessageCircle, Utensils } from 'lucide-react';

import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Avatar, DropdownItem, DropdownMenu } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { cx } from '@/lib/cx';
import { Wordmark } from './wordmark';
import { NavigationProgress, ProgressLink } from './navigation-progress';
import { ShellSkeleton } from './shell-skeleton';

const NAV_ITEMS = [
  { label: 'Тренування', href: '/client', icon: Dumbbell },
  { label: 'Прогрес', href: '/client/progress', icon: ChartNoAxesCombined },
  { label: 'Чат', href: '/client/chat', icon: MessageCircle },
];

/** The client-app sections later phases will fill; visible so the frame is honest. */
const UPCOMING_SECTIONS = [{ label: 'Харчування', icon: Utensils }];

/**
 * The client's app shell: the trainer's brand up top, the client's own identity
 * on the right, and the section frame Phase 1 fills in.
 *
 * Guards its subtree by loading /auth/client/me once. On 401 it probes the
 * trainer /auth/me before deciding where to send the visitor: a trainer who
 * wandered in belongs in /dashboard, not on a client login form that would
 * reject them. Probing only ever asks about the caller's own cookie, so nothing
 * leaks.
 */

export function ClientShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<ClientSession | undefined>();

  useEffect(() => {
    let active = true;

    apiFetch<ClientSession>('/auth/client/me')
      .then((loaded) => {
        if (active) setSession(loaded);
      })
      .catch(() => {
        apiFetch('/auth/me')
          .then(() => {
            router.replace('/dashboard');
          })
          .catch(() => {
            router.replace('/client/login');
          });
      });

    return () => {
      active = false;
    };
  }, [router]);

  if (session === undefined) {
    return <ShellSkeleton variant="client" />;
  }

  const { client, trainer } = session;

  return (
    <div className="relative min-h-dvh bg-bg-subtle">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--color-accent)_8%,transparent),transparent_70%)]"
      />
      <NavigationProgress />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-70 focus:rounded-control focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm"
      >
        Перейти до вмісту
      </a>

      <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/80 backdrop-blur-xl">
        <div className="relative mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:h-[4.5rem] sm:px-6">
          <TrainerBrandMark
            brandName={trainer.brandName}
            brandLogoUrl={trainer.brandLogoUrl}
            brandColor={trainer.brandColor}
          />

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />

            <DropdownMenu
              triggerLabel="Меню користувача"
              trigger={
                <>
                  <Avatar name={client.fullName} size="sm" />
                  <span className="hidden text-sm font-semibold text-text sm:inline">
                    {client.fullName}
                  </span>
                </>
              }
            >
              {() => (
                <>
                  <p className="px-3 py-2 text-xs text-text-secondary">
                    {client.email}
                    <span className="mt-0.5 block">Тренер: {trainer.displayName}</span>
                  </p>
                  <LogoutItem />
                </>
              )}
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="relative mx-auto flex max-w-5xl gap-8 px-4 sm:px-6">
        <nav
          aria-label="Основна навігація"
          className="fixed inset-x-3 bottom-3 z-40 rounded-panel border border-border bg-surface/92 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-e4 backdrop-blur-xl sm:sticky sm:inset-auto sm:top-[6rem] sm:z-auto sm:mt-6 sm:h-fit sm:w-52 sm:shrink-0 sm:bg-surface/75 sm:p-3 sm:shadow-e1"
        >
          <p className="mb-2 hidden px-3 pt-2 text-2xs font-bold uppercase tracking-[0.14em] text-text-muted sm:block">
            Мій простір
          </p>
          <ul className="grid grid-cols-3 gap-1 sm:block sm:space-y-1">
            {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
              const active = pathname === href;

              return (
                <li key={href}>
                  <ProgressLink
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex min-h-14 flex-col items-center justify-center gap-1 rounded-control px-2 text-[0.6875rem] font-bold transition-[color,background-color,box-shadow] sm:min-h-11 sm:flex-row sm:justify-start sm:gap-3 sm:px-3 sm:text-sm',
                      active
                        ? 'bg-accent-subtle text-accent-text shadow-[inset_0_0_0_1px_rgb(255_91_50_/_0.12)]'
                        : 'text-text-secondary hover:bg-bg-subtle hover:text-text',
                    )}
                  >
                    <Icon className="size-5 sm:size-4" aria-hidden="true" />
                    <span>{label}</span>
                  </ProgressLink>
                </li>
              );
            })}
            {UPCOMING_SECTIONS.map(({ label, icon: Icon }) => (
              <li key={label} className="hidden sm:block">
                {/* Plain text, not a control: keyboard users must never land
                      on a link that goes nowhere. */}
                <span className="flex min-h-11 items-center gap-3 rounded-control px-3 text-sm text-text-muted">
                  <Icon className="size-4" aria-hidden="true" />
                  <span>{label}</span>
                  <span className="ml-auto text-[0.6rem] font-bold uppercase tracking-wide">
                    скоро
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" className="min-w-0 flex-1 pb-28 pt-6 sm:py-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * The trainer's brand, or the Gart wordmark when they have not set one.
 * `brandColor` is an arbitrary trainer-chosen value, so it is never allowed to
 * carry text — it appears only as a decorative mark beside an AA-checked label.
 */
function TrainerBrandMark({
  brandName,
  brandLogoUrl,
  brandColor,
}: {
  brandName: string | null;
  brandLogoUrl: string | null;
  brandColor: string | null;
}) {
  if (brandName === null && brandLogoUrl === null) {
    return <Wordmark href="/client" />;
  }

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {brandLogoUrl !== null && (
        // Plain <img>: the URL points wherever the trainer hosts their logo,
        // which next/image would reject without per-domain configuration.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brandLogoUrl} alt="" className="size-7 shrink-0 rounded-full object-cover" />
      )}

      {brandColor !== null && (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: brandColor }}
        />
      )}

      <span className="truncate text-lg font-bold tracking-[-0.03em] text-text">
        {brandName ?? 'Gart'}
      </span>
    </span>
  );
}

function LogoutItem() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <DropdownItem
      disabled={pending}
      onClick={() => {
        setPending(true);
        void apiFetch<null>('/auth/logout', { method: 'POST' }).finally(() => {
          router.replace('/client/login');
        });
      }}
    >
      {pending ? 'Виходимо…' : 'Вийти'}
    </DropdownItem>
  );
}
