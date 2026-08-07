'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AuthSession } from '@gart/shared';
import { Menu } from 'lucide-react';

import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Avatar, Button, DropdownItem, DropdownMenu } from '@/components/ui';
import { useFocusTrap } from '@/components/ui/use-focus-trap';
import { apiFetch } from '@/lib/api';
import { cx } from '@/lib/cx';
import { AppNav } from './app-nav';
import { Wordmark } from './wordmark';
import { NavigationProgress } from './navigation-progress';
import { ShellSkeleton } from './shell-skeleton';

/**
 * The trainer shell: header, side navigation, content. Guards the routes beneath
 * it by loading the session once, so no page has to repeat that.
 *
 * On 401 it probes the client /auth/client/me before choosing a destination: a
 * signed-in client who wandered onto /dashboard belongs in their own app, not
 * on a trainer login form that would reject them. The probe only ever asks
 * about the caller's own cookie, so nothing leaks.
 */

/**
 * The sidebar is a drawer only below `lg`; from there it is a static column.
 * Everything modal about it — the focus trap, the scrim, the scroll lock — has
 * to key off the breakpoint as well as the toggle, or a resize from a phone
 * width to a desktop one would leave focus trapped inside an ordinary sidebar.
 */
const DRAWER_QUERY = '(max-width: 1023.98px)';

function subscribeToWidth(onChange: () => void): () => void {
  const query = window.matchMedia(DRAWER_QUERY);

  query.addEventListener('change', onChange);

  return () => {
    query.removeEventListener('change', onChange);
  };
}

function isDrawerWidth(): boolean {
  return window.matchMedia(DRAWER_QUERY).matches;
}

/** The server cannot know the viewport; the first client pass settles it. */
function notDrawerOnServer(): boolean {
  return false;
}

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
        apiFetch('/auth/client/me')
          .then(() => {
            router.replace('/client');
          })
          .catch(() => {
            router.replace('/login');
          });
      });

    return () => {
      active = false;
    };
  }, [router]);

  // The drawer is a modal surface below lg, so it needs the same courtesies as
  // a dialog: focus held inside, Escape out, focus handed back to the trigger.
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerWidth = useSyncExternalStore(subscribeToWidth, isDrawerWidth, notDrawerOnServer);

  // Open AND narrow. Widening the window therefore closes the drawer for every
  // purpose at once, without a stale flag to clean up.
  const drawerOpen = navOpen && drawerWidth;

  useFocusTrap(drawerRef, drawerOpen);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    // The drawer covers the page, so the page behind it should not scroll —
    // the same courtesy Modal extends.
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  if (session === undefined) {
    return <ShellSkeleton variant="trainer" />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <NavigationProgress />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-70 focus:rounded-control focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm"
      >
        Перейти до вмісту
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
          <span className="lg:hidden">
            <Button
              ref={menuButtonRef}
              variant="ghost"
              size="sm"
              aria-label="Меню"
              aria-expanded={navOpen}
              aria-controls="app-nav"
              onClick={() => {
                setNavOpen((open) => !open);
              }}
            >
              <Menu className="size-5" aria-hidden="true" />
            </Button>
          </span>

          <Wordmark href="/dashboard" />

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
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

      {/* Scrim for the drawer. Only exists where the drawer does. */}
      {drawerOpen && (
        <div
          aria-hidden="true"
          onClick={() => {
            setNavOpen(false);
          }}
          className="fixed inset-0 z-40 bg-[#0D0F14]/60 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <div className="flex flex-1">
        {/*
          One nav, two shapes. Below lg it is a drawer over the content; from lg
          it is a permanent column. Rendering it twice would put two identical
          «Основна навігація» landmarks in the tree.

          Closed on mobile means `hidden`, not merely translated away, so no one
          can tab into a nav they cannot see.
        */}
        <aside
          id="app-nav"
          ref={drawerRef}
          className={cx(
            'shrink-0 border-border lg:block lg:w-60 lg:border-r',
            'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:w-72 max-lg:border-r max-lg:bg-surface max-lg:shadow-e4',
            drawerOpen ? 'block' : 'hidden',
          )}
        >
          <div className="p-4 lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:p-4">
            <AppNav
              onNavigate={() => {
                setNavOpen(false);
              }}
            />
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
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
