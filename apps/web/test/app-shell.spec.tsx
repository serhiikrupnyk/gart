import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthSession } from '@gart/shared';

import { AppShell } from '@/components/layout/app-shell';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/ui';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/dashboard',
}));

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  ApiError: class extends Error {},
}));

const SESSION: AuthSession = {
  user: {
    id: 'u1',
    email: 'olena@gart.fit',
    name: 'Олена Ковальчук',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  trainer: {
    id: 't1',
    userId: 'u1',
    displayName: 'Олена Ковальчук',
    brandName: null,
    brandLogoUrl: null,
    brandColor: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

function renderShell() {
  return render(
    <ThemeProvider initial="system">
      <ToastProvider>
        <AppShell>
          <p>вміст сторінки</p>
        </AppShell>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe('AppShell', () => {
  /**
   * jsdom reports every media query as false, so the shell would always believe
   * it is at desktop width — where the sidebar is a static column and the drawer
   * behaviour under test does not exist. This puts the suite at a phone width.
   */
  function atPhoneWidth(): void {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    });
  }

  beforeEach(() => {
    apiFetch.mockReset();
    replace.mockReset();
  });

  it('renders the accessible landmarks once the session loads', async () => {
    apiFetch.mockResolvedValue(SESSION);
    renderShell();

    expect(await screen.findByText('вміст сторінки')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Перейти до вмісту' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Основна навігація' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Тема оформлення' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Меню користувача' })).toBeInTheDocument();
  });

  it('opens the navigation drawer without hiding the page content', async () => {
    atPhoneWidth();
    apiFetch.mockResolvedValue(SESSION);
    renderShell();

    await screen.findByText('вміст сторінки');

    const menu = screen.getByRole('button', { name: 'Меню' });

    expect(menu).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(menu);

    expect(menu).toHaveAttribute('aria-expanded', 'true');
    // The old shell replaced <main> with the nav; the drawer overlays it.
    expect(screen.getByText('вміст сторінки')).toBeInTheDocument();
  });

  it('closes the drawer on Escape and hands focus back to the trigger', async () => {
    atPhoneWidth();
    apiFetch.mockResolvedValue(SESSION);
    renderShell();

    await screen.findByText('вміст сторінки');

    const menu = screen.getByRole('button', { name: 'Меню' });

    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{Escape}');

    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveFocus();
  });

  it('closes the drawer when a destination is chosen', async () => {
    atPhoneWidth();
    apiFetch.mockResolvedValue(SESSION);
    renderShell();

    await screen.findByText('вміст сторінки');

    const menu = screen.getByRole('button', { name: 'Меню' });

    await userEvent.click(menu);
    await userEvent.click(screen.getByRole('link', { name: 'Тренування' }));

    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('marks the current section and offers the unbuilt ones as coming soon', async () => {
    apiFetch.mockResolvedValue(SESSION);
    renderShell();

    expect(await screen.findByRole('link', { name: 'Клієнти' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // Тренування links to the exercise library since Step 9; the current
    // section is /dashboard, so it must not read as active.
    const workouts = screen.getByRole('link', { name: 'Тренування' });
    expect(workouts).toHaveAttribute('href', '/dashboard/programs');
    expect(workouts).not.toHaveAttribute('aria-current');

    // Платежі is a built section since Step 27 — the trainer's own subscription
    // to Gart has a screen, so the nav takes them to it.
    expect(screen.getByRole('link', { name: /Платежі/ })).toHaveAttribute(
      'href',
      '/dashboard/billing',
    );

    // Still-unbuilt sections are visible but are not links, so keyboard users
    // never land on a control that does nothing.
    expect(screen.queryByRole('link', { name: /Прогрес/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('скоро')).toHaveLength(1);
  });

  it('sends an unauthenticated visitor to the login page', async () => {
    apiFetch.mockRejectedValue(new Error('401'));
    renderShell();

    await screen.findByRole('status');
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('logs out from the user menu', async () => {
    apiFetch.mockResolvedValue(SESSION);
    renderShell();

    await screen.findByText('вміст сторінки');
    await userEvent.click(screen.getByRole('button', { name: 'Меню користувача' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Вийти' }));

    expect(apiFetch).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
  });
});
