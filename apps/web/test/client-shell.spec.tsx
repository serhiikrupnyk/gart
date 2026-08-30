import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClientSession } from '@gart/shared';

import { ClientShell } from '@/components/layout/client-shell';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/ui';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/client',
}));

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  // The shell reaches API_URL transitively through @/lib/brand, to resolve a
  // logo against the API rather than the Next origin. Omitting it here left
  // brandLogoSrc yielding "undefined/brand/…" with nothing asserting on it.
  API_URL: 'http://api.test',
  ApiError: class extends Error {},
}));

function session(overrides: Partial<ClientSession['trainer']> = {}): ClientSession {
  return {
    client: {
      id: 'c1',
      fullName: 'Марія Бондаренко',
      email: 'maria@example.com',
      status: 'ACTIVE',
      hasAccount: true,
      invitedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    trainer: {
      displayName: 'Олена Ковальчук',
      brandName: null,
      brandLogoUrl: null,
      brandColor: null,
      ...overrides,
    },
  };
}

function renderShell() {
  return render(
    <ThemeProvider initial="system">
      <ToastProvider>
        <ClientShell>
          <p>вміст клієнта</p>
        </ClientShell>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe('ClientShell', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    replace.mockReset();
  });

  it('falls back to the Gart wordmark when the trainer has no brand', async () => {
    apiFetch.mockResolvedValue(session());
    renderShell();

    expect(await screen.findByText('вміст клієнта')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /gart/ })).toBeInTheDocument();
    expect(screen.getByText('Марія Бондаренко')).toBeInTheDocument();
  });

  it("shows the trainer's brand when set", async () => {
    apiFetch.mockResolvedValue(
      session({ brandName: 'Кузня', brandLogoUrl: 'https://x.test/logo.png' }),
    );
    renderShell();

    expect(await screen.findByText('Кузня')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /gart/ })).not.toBeInTheDocument();
  });

  it('links every section — none is a placeholder any more', async () => {
    apiFetch.mockResolvedValue(session());
    renderShell();

    await screen.findByText('вміст клієнта');

    const workouts = screen.getByRole('link', { name: 'Тренування' });
    expect(workouts).toHaveAttribute('href', '/client');
    expect(workouts).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Прогрес' })).toHaveAttribute(
      'href',
      '/client/progress',
    );

    // «Харчування» was the last «скоро» placeholder in the client app, and
    // Step 30 filled it — so the shell now carries no dead controls at all.
    expect(screen.getByRole('link', { name: 'Харчування' })).toHaveAttribute(
      'href',
      '/client/nutrition',
    );
    expect(screen.queryAllByText('скоро')).toHaveLength(0);
  });

  it('sends a visitor with no session of any kind to the client login', async () => {
    apiFetch.mockRejectedValue(new Error('401'));
    renderShell();

    await screen.findByRole('status');
    // Both probes failed: /auth/client/me first, then the trainer /auth/me.
    expect(apiFetch).toHaveBeenCalledWith('/auth/client/me');
    expect(apiFetch).toHaveBeenCalledWith('/auth/me');
    expect(replace).toHaveBeenCalledWith('/client/login');
  });

  it('sends a signed-in trainer to their own app instead of a login loop', async () => {
    apiFetch.mockImplementation((path: unknown) =>
      path === '/auth/me' ? Promise.resolve({}) : Promise.reject(new Error('401')),
    );
    renderShell();

    await screen.findByRole('status');
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('logs out through the shared logout endpoint', async () => {
    apiFetch.mockImplementation((path: unknown) =>
      path === '/auth/client/me' ? Promise.resolve(session()) : Promise.resolve(null),
    );
    renderShell();

    await screen.findByText('вміст клієнта');
    await userEvent.click(screen.getByRole('button', { name: 'Меню користувача' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Вийти' }));

    expect(apiFetch).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
  });
});
