'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { NotificationList, PublicNotification } from '@gart/shared';
import { Bell } from 'lucide-react';

import { Button, useToast } from '@/components/ui';
import { cx } from '@/lib/cx';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications';
import { enablePush, pushPermission } from '@/lib/push';

/** «щойно» / «2 год тому» / «3 дн. тому» — enough for a feed. */
function ago(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);

  if (minutes < 1) return 'щойно';
  if (minutes < 60) return `${String(minutes)} хв тому`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${String(hours)} год тому`;

  return `${String(Math.floor(hours / 24))} дн. тому`;
}

/**
 * The bell and its panel — which, for a trainer, IS the client activity feed:
 * «client X did Y» is exactly what a notification is for them, so there is one
 * surface rather than two that could disagree.
 */
export function NotificationBell() {
  const { notify } = useToast();

  const [data, setData] = useState<NotificationList | undefined>();
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    listNotifications()
      .then((loaded) => {
        if (active) setData(loaded);
      })
      .catch(() => {
        // A failing bell must never be louder than the page it sits on.
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const unread = data?.unreadCount ?? 0;

  async function readOne(notification: PublicNotification): Promise<void> {
    if (notification.readAt !== null) {
      return;
    }

    try {
      await markNotificationRead(notification.id);
      setReloadKey((key) => key + 1);
    } catch {
      notify('Не вдалося позначити прочитаним', 'danger');
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Сповіщення: ${String(unread)} непрочитаних` : 'Сповіщення'}
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="relative inline-flex size-10 items-center justify-center rounded-control text-text-secondary hover:bg-bg-subtle hover:text-text"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 min-w-4 rounded-full bg-accent px-1 text-2xs font-semibold text-accent-contrast">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-card border border-border bg-surface-raised shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-text">Сповіщення</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() =>
                  void markAllNotificationsRead()
                    .then(() => {
                      setReloadKey((key) => key + 1);
                    })
                    .catch(() => {
                      notify('Не вдалося позначити прочитаними', 'danger');
                    })
                }
                className="min-h-11 text-xs font-medium text-accent"
              >
                Позначити всі
              </button>
            )}
          </div>

          <PushOptIn />

          {data === undefined || data.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-text-secondary">Сповіщень немає.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void readOne(item)}
                    className={cx(
                      'block w-full px-3 py-2 text-left hover:bg-bg-subtle',
                      item.readAt === null && 'bg-accent-subtle/40',
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-text">{item.title}</span>
                      <span className="shrink-0 text-2xs text-text-secondary">
                        {ago(item.createdAt, new Date())}
                      </span>
                    </span>
                    {item.body !== null && (
                      <span className="mt-0.5 block text-sm text-text-secondary">{item.body}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The permission ask, deliberately: a quiet card that explains itself, and a
 * button that is the only thing which ever triggers the browser dialog.
 */
function PushOptIn() {
  // Permission is browser state, not React state: useSyncExternalStore reads
  // it without an effect and gives the server a snapshot of its own, so the
  // control simply is not rendered until the client knows the answer.
  const browserPermission = useSyncExternalStore(subscribeNever, pushPermission, serverSnapshot);
  const [granted, setGranted] = useState<NotificationPermission | undefined>();
  const [pending, setPending] = useState(false);

  const permission = granted ?? browserPermission;

  if (permission === 'unsupported' || permission === 'granted') {
    return null;
  }

  if (permission === 'denied') {
    return (
      <p className="border-b border-border px-3 py-2 text-xs text-text-secondary">
        Сповіщення вимкнено в налаштуваннях браузера.
      </p>
    );
  }

  return (
    <div className="border-b border-border px-3 py-2">
      <p className="text-xs text-text-secondary">
        Увімкніть сповіщення, щоб не пропустити важливе.
      </p>
      <div className="mt-1.5">
        <Button
          variant="secondary"
          size="sm"
          loading={pending}
          onClick={() => {
            setPending(true);
            void enablePush()
              .then(setGranted)
              .catch(() => {
                setGranted('denied');
              })
              .finally(() => {
                setPending(false);
              });
          }}
        >
          Увімкнути сповіщення
        </Button>
      </div>
    </div>
  );
}

/** Permission only changes through our own call, so there is nothing to watch. */
function subscribeNever(): () => void {
  return () => undefined;
}

function serverSnapshot(): 'unsupported' {
  return 'unsupported';
}
