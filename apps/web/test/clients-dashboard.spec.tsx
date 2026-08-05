import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClientListItem } from '@gart/shared';

import DashboardPage from '@/app/(app)/dashboard/page';
import { ToastProvider } from '@/components/ui';

const listClients = jest.fn();
jest.mock('@/lib/clients', () => ({
  listClients: () => listClients() as unknown,
  createClient: jest.fn(),
  STATUS_LABELS: { INVITED: 'Запрошено', ACTIVE: 'Активний', ARCHIVED: 'В архіві' },
}));

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
  API_URL: 'http://api.test',
  ApiError: class ApiError extends Error {},
}));

function client(overrides: Partial<ClientListItem> = {}): ClientListItem {
  return {
    id: 'c-1',
    fullName: 'Олена Коваль',
    email: 'olena@example.com',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLoggedAt: '2026-08-05T08:00:00.000Z',
    attention: null,
    ...overrides,
  } as ClientListItem;
}

function renderPage() {
  return render(
    <ToastProvider>
      <DashboardPage />
    </ToastProvider>,
  );
}

const ROSTER = [
  client({ id: 'c-1', fullName: 'Олена Коваль', email: 'olena@example.com' }),
  // The API computes `attention` only for ACTIVE clients, so the fixtures do
  // not invent states the backend cannot produce.
  client({
    id: 'c-2',
    fullName: 'Тарас Бондар',
    email: 'taras@example.com',
    status: 'ACTIVE',
    attention: 'MISSED',
  }),
  client({
    id: 'c-3',
    fullName: 'Ірина Шевчук',
    email: 'iryna@example.com',
    status: 'ACTIVE',
    attention: 'SKIPPED',
  }),
  client({
    id: 'c-4',
    fullName: 'Богдан Мороз',
    email: 'bohdan@example.com',
    status: 'INVITED',
  }),
];

beforeEach(() => {
  listClients.mockReset();
});

describe('clients dashboard', () => {
  it('shows the welcoming empty state, not a bare table, when there are no clients', async () => {
    listClients.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Ще немає клієнтів')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Додати клієнта/ }).length).toBeGreaterThan(0);
  });

  it('lists each client with a link to their page', async () => {
    listClients.mockResolvedValue(ROSTER);
    renderPage();

    const link = await screen.findByRole('link', { name: 'Олена Коваль' });

    expect(link).toHaveAttribute('href', '/dashboard/clients/c-1');
    expect(screen.getByText('olena@example.com')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(5); // header + four clients
  });

  it('puts a real target in the column headed «Відкрити», not a decorative glyph', async () => {
    listClients.mockResolvedValue(ROSTER);
    renderPage();

    // Always present, not revealed on hover: a hover-gated affordance does not
    // exist at all on a touch device.
    const open = await screen.findByRole('link', { name: 'Відкрити картку: Олена Коваль' });

    expect(open).toHaveAttribute('href', '/dashboard/clients/c-1');
  });

  it('counts who needs attention and surfaces it in the header', async () => {
    listClients.mockResolvedValue(ROSTER);
    renderPage();

    expect(await screen.findByText('2 потребують уваги')).toBeInTheDocument();
  });

  it('filters to the clients that need attention', async () => {
    listClients.mockResolvedValue(ROSTER);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('link', { name: 'Олена Коваль' });

    const group = screen.getByRole('group', { name: 'Фільтр за станом' });

    await user.click(within(group).getByRole('button', { name: /Потребують уваги/ }));

    expect(screen.queryByRole('link', { name: 'Олена Коваль' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Тарас Бондар' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ірина Шевчук' })).toBeInTheDocument();
  });

  it('searches by name and by email', async () => {
    listClients.mockResolvedValue(ROSTER);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('link', { name: 'Олена Коваль' });

    const search = screen.getByRole('searchbox', { name: 'Пошук клієнтів' });

    await user.type(search, 'taras@');

    expect(screen.getByRole('link', { name: 'Тарас Бондар' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Олена Коваль' })).not.toBeInTheDocument();
  });

  it('offers a way back when a filter matches nothing', async () => {
    listClients.mockResolvedValue(ROSTER);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('link', { name: 'Олена Коваль' });

    await user.type(screen.getByRole('searchbox', { name: 'Пошук клієнтів' }), 'нікого');

    expect(screen.getByText('Нічого не знайдено')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Скинути фільтри' }));

    expect(screen.getByRole('link', { name: 'Олена Коваль' })).toBeInTheDocument();
  });

  it('announces the result of filtering, not just the chip state', async () => {
    listClients.mockResolvedValue(ROSTER);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('link', { name: 'Олена Коваль' });

    expect(screen.getByText('Показано 4 клієнтів із 4')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Пошук клієнтів' }), 'taras@');

    // The live region carries the outcome a sighted user reads off the table.
    expect(screen.getByText('Показано 1 клієнта із 4')).toBeInTheDocument();
  });

  it('marks the active filter for assistive tech, not just visually', async () => {
    listClients.mockResolvedValue(ROSTER);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('link', { name: 'Олена Коваль' });

    const group = screen.getByRole('group', { name: 'Фільтр за станом' });
    const all = within(group).getByRole('button', { name: /Усі/ });
    const active = within(group).getByRole('button', { name: /Активні/ });

    expect(all).toHaveAttribute('aria-pressed', 'true');

    await user.click(active);

    expect(active).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('aria-pressed', 'false');
  });
});
