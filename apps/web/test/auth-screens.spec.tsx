import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LoginPage from '@/app/(auth)/login/page';
import RegisterPage from '@/app/(auth)/register/page';
import ClientLoginPage from '@/app/(auth)/client/login/page';
import { ThemeProvider } from '@/components/theme/theme-provider';

/**
 * These pages had no web tests at all — auth behaviour is covered by the API
 * suite. This guards the presentation the reskin moved: the label/control
 * wiring, the autocomplete contract browsers and password managers depend on,
 * and the error and pending states. It asserts only what already held.
 */
const apiFetch = jest.fn();

class MockApiError extends Error {}

jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  API_URL: 'http://api.test',
  get ApiError() {
    return MockApiError;
  },
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
}));

function renderPage(node: React.ReactElement) {
  return render(<ThemeProvider initial="system">{node}</ThemeProvider>);
}

beforeEach(() => {
  apiFetch.mockReset();
  replace.mockReset();
});

describe('auth screens', () => {
  it('ties every label to its control and keeps the autocomplete contract', () => {
    renderPage(<LoginPage />);

    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Пароль');

    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(password).toHaveAttribute('type', 'password');
    // A sign-in form must say current-password, not new-password: password
    // managers offer to save a new credential on the latter.
    expect(password).toHaveAttribute('autocomplete', 'current-password');
  });

  it('marks registration as creating a new credential', () => {
    renderPage(<RegisterPage />);

    expect(screen.getByLabelText("Ім'я")).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('offers the client its own sign-in with the same wiring', () => {
    renderPage(<ClientLoginPage />);

    expect(
      screen.getByRole('heading', { name: 'Вхід для клієнтів', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('shows a field error without contacting the API', async () => {
    renderPage(<LoginPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Увійти' }));

    expect(screen.getByText('Введіть пароль')).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  async function submitLogin() {
    await userEvent.type(screen.getByLabelText('Email'), 'demo@gart.fit');
    await userEvent.type(screen.getByLabelText('Пароль'), 'demo12345');
    await userEvent.click(screen.getByRole('button', { name: 'Увійти' }));
  }

  it("shows the API's own message when the failure is an ApiError", async () => {
    // The generic-credentials message is the API's to choose — the screen must
    // pass it through rather than substitute its own.
    apiFetch.mockRejectedValue(new MockApiError('Невірний email або пароль'));
    renderPage(<LoginPage />);

    await submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent('Невірний email або пароль');
  });

  it('falls back to a generic message when the failure is not an ApiError', async () => {
    apiFetch.mockRejectedValue(new Error('boom'));
    renderPage(<LoginPage />);

    await submitLogin();

    // A transport error must not leak its internals to the user.
    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Не вдалося увійти');
    expect(alert).not.toHaveTextContent('boom');
    // Submitting disabled the focused button, which drops focus to <body>;
    // the message takes it so a keyboard user is not stranded at the top.
    expect(alert).toHaveFocus();
    // Re-enabled, so a failed attempt is not a dead end.
    expect(screen.getByRole('button', { name: 'Увійти' })).toBeEnabled();
  });

  it('keeps the field icons decorative', () => {
    const { container } = renderPage(<LoginPage />);

    for (const svg of container.querySelectorAll('form svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }

    // The label, not the icon, is what names the control.
    expect(screen.getByLabelText('Email')).toHaveAccessibleName('Email');
  });
});
