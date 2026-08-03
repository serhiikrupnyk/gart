'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import type { ClientSession } from '@gart/shared';

import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Avatar, DropdownItem, DropdownMenu, Spinner } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { cx } from '@/lib/cx';
import { Wordmark } from './wordmark';

const NAV_ITEMS = [
  { label: 'Тренування', href: '/client' },
  { label: 'Прогрес', href: '/client/progress' },
];

/** The client-app sections later phases will fill; visible so the frame is honest. */
const UPCOMING_SECTIONS = ['Харчування'];

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
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Spinner size="lg" label="Завантаження" />
      </div>
    );
  }

  const { client, trainer } = session;

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-70 focus:rounded-control focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm"
      >
        Перейти до вмісту
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4 sm:px-6">
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
                  <span className="hidden text-sm text-text sm:inline">{client.fullName}</span>
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

      <div className="mx-auto flex max-w-4xl gap-8 px-4 sm:px-6">
        <aside className="hidden w-48 shrink-0 py-6 sm:block">
          <nav aria-label="Основна навігація">
            <ul className="space-y-0.5">
              {NAV_ITEMS.map(({ label, href }) => {
                const active = pathname === href;

                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'block rounded-control px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-accent-subtle text-accent'
                          : 'text-text-secondary hover:bg-bg-subtle hover:text-text',
                      )}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
              {UPCOMING_SECTIONS.map((label) => (
                <li key={label}>
                  {/* Plain text, not a control: keyboard users must never land
                      on a link that goes nowhere. */}
                  <span className="flex items-center justify-between rounded-control px-3 py-2 text-sm text-text-muted">
                    {label}
                    <span className="text-2xs uppercase tracking-wide">скоро</span>
                  </span>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main id="main" className="min-w-0 flex-1 py-8">
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

      <span className="truncate text-lg font-semibold tracking-tight text-text">
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
