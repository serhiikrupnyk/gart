import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthSession } from '@gart/shared';

import { AppShell } from '@/components/layout/app-shell';
import { ThemeProvider } from '@/components/theme/theme-provider';

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
      <AppShell>
        <p>вміст сторінки</p>
      </AppShell>
    </ThemeProvider>,
  );
}

describe('AppShell', () => {
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

  it('marks the current section and offers the unbuilt ones as coming soon', async () => {
    apiFetch.mockResolvedValue(SESSION);
    renderShell();

    expect(await screen.findByRole('link', { name: 'Клієнти' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // Unbuilt sections are visible but are not links, so keyboard users never
    // land on a control that does nothing.
    expect(screen.queryByRole('link', { name: /Тренування/ })).not.toBeInTheDocument();
    expect(screen.getByText('Тренування')).toBeInTheDocument();
    expect(screen.getAllByText('скоро')).toHaveLength(3);
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
