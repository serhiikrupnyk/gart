import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NotificationList, PublicNotification } from '@gart/shared';

import { NotificationBell } from '@/components/notifications/notification-bell';
import { ToastProvider } from '@/components/ui';

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  ApiError: class extends Error {},
}));

function item(overrides: Partial<PublicNotification> = {}): PublicNotification {
  return {
    id: 'n-1',
    type: 'WORKOUT_LOGGED',
    title: 'Марія Бондаренко',
    body: 'Запис тренування',
    clientId: 'c-1',
    createdAt: new Date().toISOString(),
    readAt: null,
    ...overrides,
  };
}

function feed(overrides: Partial<NotificationList> = {}): NotificationList {
  return { items: [item()], total: 1, unreadCount: 1, ...overrides };
}

interface FetchInit {
  method?: string;
}

function mockApi(result: NotificationList = feed()): void {
  apiFetch.mockImplementation((path: unknown, init?: FetchInit) => {
    if (init?.method !== undefined) {
      return Promise.resolve(null);
    }
    if ((path as string).startsWith('/notifications')) {
      return Promise.resolve(result);
    }

    return Promise.reject(new Error(`Unexpected call: ${path as string}`));
  });
}

function renderBell() {
  return render(
    <ToastProvider>
      <NotificationBell />
    </ToastProvider>,
  );
}

describe('NotificationBell', () => {
  const originalNotification = globalThis.Notification;

  beforeEach(() => {
    apiFetch.mockReset();
    // jsdom has no Notification API — the default is an unsupported browser.
    Reflect.deleteProperty(globalThis, 'Notification');
  });

  afterEach(() => {
    if (originalNotification !== undefined) {
      globalThis.Notification = originalNotification;
    }
  });

  it('shows the unread count, and none when everything is read', async () => {
    mockApi();
    const { unmount } = renderBell();

    expect(
      await screen.findByRole('button', { name: 'Сповіщення: 1 непрочитаних' }),
    ).toBeInTheDocument();

    unmount();
    mockApi(feed({ items: [item({ readAt: new Date().toISOString() })], unreadCount: 0 }));
    renderBell();

    expect(await screen.findByRole('button', { name: 'Сповіщення' })).toBeInTheDocument();
  });

  it('opens the feed and lists what the client did', async () => {
    mockApi();
    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole('button', { name: /Сповіщення/ }));

    expect(screen.getByText('Марія Бондаренко')).toBeInTheDocument();
    expect(screen.getByText('Запис тренування')).toBeInTheDocument();
    expect(screen.getByText('щойно')).toBeInTheDocument();
  });

  it('marks one read on click, and offers to mark all', async () => {
    mockApi();
    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole('button', { name: /Сповіщення/ }));
    await user.click(screen.getByRole('button', { name: /Марія Бондаренко/ }));

    expect(apiFetch).toHaveBeenCalledWith('/notifications/n-1/read', { method: 'PATCH' });

    await user.click(screen.getByRole('button', { name: 'Позначити всі' }));
    expect(apiFetch).toHaveBeenCalledWith('/notifications/read-all', { method: 'POST' });
  });

  it('says plainly when there is nothing', async () => {
    mockApi(feed({ items: [], total: 0, unreadCount: 0 }));
    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole('button', { name: 'Сповіщення' }));

    expect(screen.getByText('Сповіщень немає.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Позначити всі' })).not.toBeInTheDocument();
  });

  it('offers no push control at all in a browser that cannot do it', async () => {
    mockApi();
    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole('button', { name: /Сповіщення/ }));

    expect(screen.queryByRole('button', { name: 'Увімкнути сповіщення' })).not.toBeInTheDocument();
  });

  it('asks for permission only when the person deliberately asks', async () => {
    const requestPermission = jest.fn().mockResolvedValue('granted');
    const register = jest.fn().mockResolvedValue({
      pushManager: {
        subscribe: jest.fn().mockResolvedValue({
          endpoint: 'https://push.example.com/s/1',
          getKey: () => new Uint8Array([1, 2, 3]).buffer,
        }),
      },
    });

    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      writable: true,
      value: Object.assign(jest.fn(), { permission: 'default', requestPermission }),
    });
    Object.defineProperty(globalThis, 'PushManager', { configurable: true, value: jest.fn() });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });

    apiFetch.mockImplementation((path: unknown, init?: FetchInit) => {
      if (init?.method !== undefined) return Promise.resolve(null);
      if ((path as string) === '/notifications/push/key') {
        return Promise.resolve({ publicKey: 'BBBB' });
      }

      return Promise.resolve(feed());
    });

    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole('button', { name: /Сповіщення/ }));

    // Opening the panel must not have prompted anything.
    expect(requestPermission).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Увімкнути сповіщення' }));

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/sw.js');
    expect(apiFetch).toHaveBeenCalledWith(
      '/notifications/push/subscriptions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('stays calm when the browser has already refused', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      writable: true,
      value: Object.assign(jest.fn(), { permission: 'denied', requestPermission: jest.fn() }),
    });
    Object.defineProperty(globalThis, 'PushManager', { configurable: true, value: jest.fn() });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: jest.fn() },
    });

    mockApi();
    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole('button', { name: /Сповіщення/ }));

    const panel = screen.getByText('Сповіщення', { selector: 'span' }).closest('div')
      ?.parentElement as HTMLElement;
    expect(
      within(panel).getByText('Сповіщення вимкнено в налаштуваннях браузера.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Увімкнути сповіщення' })).not.toBeInTheDocument();
  });
});
