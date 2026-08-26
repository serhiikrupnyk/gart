import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClientSession, PublicPayment, PublicSubscription } from '@gart/shared';

import BillingPage from '@/app/(app)/dashboard/billing/page';
import { AppNav } from '@/components/layout/app-nav';
import { ClientShell } from '@/components/layout/client-shell';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/ui';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/dashboard/billing',
}));

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  API_URL: 'http://api.test',
  ApiError: class extends Error {},
}));

function subscription(overrides: Partial<PublicSubscription> = {}): PublicSubscription {
  return {
    id: 's1',
    plan: 'PRO',
    period: 'MONTHLY',
    price: { amount: '500.00', currency: 'UAH' },
    status: 'TRIALING',
    pendingPeriod: null,
    currentPeriodEnd: '2026-09-09T12:00:00.000Z',
    accessUntil: '2026-09-09T12:00:00.000Z',
    nextChargeAt: null,
    failedAttempts: 0,
    isActive: true,
    canReactivate: false,
    maxClients: 3,
    clientCount: 1,
    ...overrides,
  };
}

const PAYMENT: PublicPayment = {
  id: 'p1',
  plan: 'PRO',
  amount: { amount: '500.00', currency: 'UAH' },
  status: 'SUCCEEDED',
  createdAt: '2026-08-09T12:00:00.000Z',
  paidAt: '2026-08-09T12:00:00.000Z',
};

/** Answers the page's two loads, in whatever order they settle. */
function serve(loaded: PublicSubscription | null, payments: PublicPayment[] = []): void {
  apiFetch.mockImplementation((path: string) => {
    if (path === '/billing/subscription') return Promise.resolve(loaded);
    if (path === '/billing/payments') return Promise.resolve(payments);

    return Promise.resolve(null);
  });
}

function renderBilling() {
  return render(
    <ThemeProvider initial="system">
      <ToastProvider>
        <BillingPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  replace.mockReset();
});

describe('the billing entry point', () => {
  it('is reachable from the main navigation — «Платежі» is a real link now', () => {
    render(
      <ThemeProvider initial="system">
        <AppNav />
      </ThemeProvider>,
    );

    // The API without a way in would be an unfinished feature.
    expect(screen.getByRole('link', { name: /Платежі/ })).toHaveAttribute(
      'href',
      '/dashboard/billing',
    );
  });

  it('is nowhere in the client app, which has no billing surface at all', async () => {
    const session: ClientSession = {
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
      trainer: { displayName: 'Олена', brandName: null, brandLogoUrl: null, brandColor: null },
    };
    apiFetch.mockResolvedValue(session);

    render(
      <ThemeProvider initial="system">
        <ToastProvider>
          <ClientShell>
            <p>вміст клієнта</p>
          </ClientShell>
        </ToastProvider>
      </ThemeProvider>,
    );

    await screen.findByText('вміст клієнта');

    // A client never pays Gart and never sees their trainer's bill.
    expect(screen.queryByText(/Платежі/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Підписка/)).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link').map((link) => link.getAttribute('href'))).not.toContain(
      '/dashboard/billing',
    );
  });
});

describe('the billing page', () => {
  it('names the trial, its end date, and that no card was taken', async () => {
    serve(subscription());
    renderBilling();

    expect(await screen.findByText(/Пробний період до/)).toBeInTheDocument();
    expect(screen.getByText(/нічого не спишеться/)).toBeInTheDocument();
    // The allowance, so the screen never promises what the API would refuse.
    expect(screen.getByText('1 з 3')).toBeInTheDocument();
  });

  it('sells Pro and marks Grow and Scale «скоро» with no way to pay', async () => {
    serve(subscription());
    renderBilling();

    await screen.findByText(/Пробний період до/);

    const buttons = screen.getAllByRole('button', { name: /Оформити підписку/ });

    // Exactly one plan can be bought, and it is the built one.
    expect(buttons).toHaveLength(1);
    expect(screen.getAllByText('Скоро')).toHaveLength(2);
    expect(screen.getByText('Gart Grow')).toBeInTheDocument();
    expect(screen.getByText('Gart Scale')).toBeInTheDocument();
  });

  it('opens a checkout for the chosen cadence and sends the trainer to the acquirer', async () => {
    const user = userEvent.setup();
    serve(subscription());
    renderBilling();

    await screen.findByText(/Пробний період до/);

    await user.selectOptions(screen.getByLabelText('Періодичність'), 'ANNUAL');
    await user.click(screen.getByRole('button', { name: /Оформити підписку/ }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/billing/subscription/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: 'PRO', period: 'ANNUAL' }),
      });
    });
  });

  it('says what a failed charge means, with the date access actually runs to', async () => {
    serve(
      subscription({
        status: 'PAST_DUE',
        failedAttempts: 1,
        accessUntil: '2026-09-15T12:00:00.000Z',
        nextChargeAt: '2026-09-10T12:00:00.000Z',
        maxClients: null,
      }),
    );
    renderBilling();

    // Not a bare alarm: what happened, until when, and that clients are fine.
    expect(await screen.findByText(/Оплата не пройшла — доступ до/)).toBeInTheDocument();
    expect(screen.getByText(/ваші клієнти тим часом працюють як зазвичай/)).toBeInTheDocument();
  });

  it('explains a lapse as read-only, not as a loss', async () => {
    serve(subscription({ status: 'ENDED', isActive: false, maxClients: null }));
    renderBilling();

    expect(await screen.findByText('Підписку завершено')).toBeInTheDocument();
    expect(screen.getByText(/усі дані на місці/)).toBeInTheDocument();
    expect(screen.getByText(/тренуються\s+як зазвичай/)).toBeInTheDocument();
  });

  it('steers a cancelled-but-running trainer to resume rather than pay twice', async () => {
    serve(subscription({ status: 'CANCELLED', canReactivate: true, maxClients: null }));
    renderBilling();

    await screen.findByText(/Скасовано — доступ до/);

    // Paying again would forfeit the rest of the period already paid for, so
    // the buy button is replaced by the reason — not merely greyed out.
    expect(screen.queryByRole('button', { name: /Оформити підписку/ })).not.toBeInTheDocument();
    expect(screen.getByText(/щоб не втратити решту оплаченого періоду/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Відновити підписку' })).toBeInTheDocument();
  });

  it('confirms a cancellation with the date, the refund rule and the way back', async () => {
    const user = userEvent.setup();
    serve(subscription({ status: 'ACTIVE', nextChargeAt: '2026-09-09T11:00:00.000Z' }), [PAYMENT]);
    renderBilling();

    await user.click(await screen.findByRole('button', { name: 'Скасувати підписку' }));

    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText(/не повертаються/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Відновити підписку можна до цієї/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Ваші клієнти нічого не втратять/)).toBeInTheDocument();
  });

  it('offers a cadence change and says plainly that nothing is charged now', async () => {
    const user = userEvent.setup();
    serve(subscription({ status: 'ACTIVE', maxClients: null }));
    renderBilling();

    await screen.findByText(/Підписка активна до/);
    expect(screen.getByText(/Зміна діє з наступного списання/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Періодичність оплати'), 'ANNUAL');

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/billing/subscription/period', {
        method: 'POST',
        body: JSON.stringify({ period: 'ANNUAL' }),
      });
    });
  });

  it('lists what has been charged, and says so when nothing has', async () => {
    serve(subscription({ status: 'ACTIVE', maxClients: null }), [PAYMENT]);
    const view = renderBilling();

    expect(await screen.findByText('Оплачено')).toBeInTheDocument();

    view.unmount();
    serve(subscription());
    renderBilling();

    expect(await screen.findByText('Списань ще не було')).toBeInTheDocument();
  });
});
