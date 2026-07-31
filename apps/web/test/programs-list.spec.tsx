import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicProgram } from '@gart/shared';

import ProgramsPage from '@/app/(app)/dashboard/programs/page';
import { ToastProvider } from '@/components/ui';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dashboard/programs',
}));

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  ApiError: class extends Error {},
}));

function program(overrides: Partial<PublicProgram> = {}): PublicProgram {
  return {
    id: 'prog-1',
    name: 'Сила: тиждень 1',
    description: 'База',
    type: 'STRENGTH',
    sectionCount: 2,
    exerciseCount: 7,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <ProgramsPage />
    </ToastProvider>,
  );
}

describe('ProgramsPage', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('lists programs with type labels and counts, under the workout tabs', async () => {
    apiFetch.mockResolvedValue({ items: [program()], total: 1, page: 1, pageSize: 20 });
    renderPage();

    expect(await screen.findByText('Сила: тиждень 1')).toBeInTheDocument();
    expect(screen.getByText('Силове')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '7' })).toBeInTheDocument();

    // The «Тренування» sub-navigation marks this page as current.
    const tabs = screen.getByRole('navigation', { name: 'Розділи тренувань' });
    expect(tabs).toContainElement(screen.getByRole('link', { name: 'Програми' }));
    expect(screen.getByRole('link', { name: 'Програми' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Бібліотека вправ' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('shows the empty state with a create CTA', async () => {
    apiFetch.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    renderPage();

    expect(await screen.findByText('Ще немає програм')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Нова програма/ }).length).toBeGreaterThan(0);
  });

  it('deletes only after confirmation', async () => {
    const remove = jest.fn(() => Promise.resolve(null));
    apiFetch.mockImplementation((_path: unknown, init?: { method?: string }) => {
      if (init?.method === 'DELETE') return remove() as Promise<unknown>;
      return Promise.resolve({ items: [program()], total: 1, page: 1, pageSize: 20 });
    });
    renderPage();

    await screen.findByText('Сила: тиждень 1');
    await userEvent.click(
      screen.getByRole('button', { name: 'Дії з програмою «Сила: тиждень 1»' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Видалити' }));

    expect(await screen.findByText('Видалити програму?')).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(remove).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Дії з програмою «Сила: тиждень 1»' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Видалити' }));
    await screen.findByText('Видалити програму?');
    await userEvent.click(screen.getByRole('button', { name: 'Видалити' }));

    await waitFor(() => {
      expect(remove).toHaveBeenCalledTimes(1);
    });
  });
});
