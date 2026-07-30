'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import type { AuthSession } from '@gart/shared';

import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Avatar, Button, DropdownItem, DropdownMenu, Spinner } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { AppNav } from './app-nav';
import { Wordmark } from './wordmark';

/**
 * The trainer shell: header, side navigation, content. Guards the routes beneath
 * it by loading the session once and redirecting to /login on 401, so no page
 * has to repeat that.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | undefined>();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    let active = true;

    apiFetch<AuthSession>('/auth/me')
      .then((loaded) => {
        if (active) setSession(loaded);
      })
      .catch(() => {
        router.replace('/login');
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

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-70 focus:rounded-control focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm"
      >
        Перейти до вмісту
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Меню"
            aria-expanded={navOpen}
            onClick={() => {
              setNavOpen((open) => !open);
            }}
          >
            <span aria-hidden="true">☰</span>
          </Button>

          <Wordmark href="/dashboard" />

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />

            <DropdownMenu
              triggerLabel="Меню користувача"
              trigger={
                <>
                  <Avatar name={session.trainer.displayName} size="sm" />
                  <span className="hidden text-sm text-text sm:inline">
                    {session.trainer.displayName}
                  </span>
                </>
              }
            >
              {() => (
                <>
                  <p className="px-3 py-2 text-xs text-text-secondary">{session.user.email}</p>
                  <LogoutItem />
                </>
              )}
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 sm:px-6">
        <aside
          className={
            navOpen ? 'w-full shrink-0 py-6 sm:w-52' : 'hidden w-52 shrink-0 py-6 sm:block'
          }
        >
          <AppNav
            onNavigate={() => {
              setNavOpen(false);
            }}
          />
        </aside>

        <main
          id="main"
          className={navOpen ? 'hidden min-w-0 flex-1 py-8 sm:block' : 'min-w-0 flex-1 py-8'}
        >
          {children}
        </main>
      </div>
    </div>
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
          router.replace('/login');
        });
      }}
    >
      {pending ? 'Виходимо…' : 'Вийти'}
    </DropdownItem>
  );
}
