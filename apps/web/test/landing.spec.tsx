import { render, screen } from '@testing-library/react';

import LandingPage from '@/app/page';
import { ThemeProvider } from '@/components/theme/theme-provider';

/**
 * The landing is a public page: it must never touch the API. The mock exists
 * only so the assertion below can prove nothing called it.
 */
const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  API_URL: 'http://api.test',
  ApiError: class extends Error {},
}));

function renderLanding() {
  return render(
    <ThemeProvider initial="system">
      <LandingPage />
    </ThemeProvider>,
  );
}

describe('landing page', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('leads with the headline and exactly one h1', () => {
    renderLanding();

    const headings = screen.getAllByRole('heading', { level: 1 });

    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/Тренуйте людей,\s*а не таблиці/);
  });

  it('sends every primary CTA to registration and the secondary to login', () => {
    renderLanding();

    const register = screen.getAllByRole('link', { name: /Спробувати безкоштовно/ });

    expect(register.length).toBeGreaterThanOrEqual(3);
    for (const link of register) {
      expect(link).toHaveAttribute('href', '/register');
    }

    for (const link of screen.getAllByRole('link', { name: 'Увійти' })) {
      expect(link).toHaveAttribute('href', '/login');
    }
  });

  it('walks the visitor through every section', () => {
    renderLanding();

    for (const heading of [
      'Тренер живе в шести вкладках',
      'Усе, що потрібно тренеру',
      'Тренерам, які ведуть людей',
      'Три стіни, яких не перейде глобальний гравець',
    ]) {
      expect(screen.getByRole('heading', { name: heading, level: 2 })).toBeInTheDocument();
    }
  });

  it('never claims payments already work', () => {
    renderLanding();

    // Both places that mention Ukrainian payments qualify them.
    const feature = screen
      .getByRole('heading', { name: 'Оплати', level: 3 })
      .closest('li') as HTMLElement;

    expect(feature).toHaveTextContent(/Скоро/);

    const moat = screen
      .getByRole('heading', { name: 'Платіжна', level: 3 })
      .closest('li') as HTMLElement;

    expect(moat).toHaveTextContent(/Скоро/);
  });

  it('shows the honest social-proof placeholder, with no invented trainers', () => {
    renderLanding();

    const quote = screen.getByText(/Тут буде історія першого тренера/);

    expect(quote.closest('blockquote')).toHaveTextContent(/без вигаданих відгуків/);
    expect(screen.getByRole('link', { name: 'Стати одним із перших' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('promises nutrition only as roadmap, never as a feature', () => {
    renderLanding();

    expect(screen.getByText(/Попереду: харчування/)).toBeInTheDocument();
  });

  it('makes no API call whatsoever', () => {
    renderLanding();

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('keeps the anchor nav pointing at real sections', () => {
    renderLanding();

    const nav = screen.getByRole('navigation', { name: 'Розділи сторінки' });

    for (const [label, id] of [
      ['Проблема', 'khaos'],
      ['Можливості', 'mozhlyvosti'],
      ['Чому Gart', 'chomu-gart'],
    ] as const) {
      const link = Array.from(nav.querySelectorAll('a')).find((a) => a.textContent === label);

      expect(link).toHaveAttribute('href', `#${id}`);
      expect(document.getElementById(id)).toBeInTheDocument();
    }
  });

  it('has a footer with the essential links', () => {
    renderLanding();

    const footer = screen.getByRole('navigation', { name: 'Футер' });
    const links = Array.from(footer.querySelectorAll('a'));

    expect(links.find((a) => a.textContent === 'Увійти')).toHaveAttribute('href', '/login');
    expect(links.find((a) => a.textContent === 'Зареєструватися')).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('keeps the product shot decorative rather than reading numbers aloud', () => {
    renderLanding();

    // Every figure in the composition is also stated in the copy beside it.
    expect(screen.getByText('5×5 · 82,5 кг').closest('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('never hides content behind the scroll reveal', () => {
    const { container } = renderLanding();

    // The reveal is CSS-only and opt-in via @supports, so revealed regions must
    // carry no inline hiding — an unsupported browser has to see them.
    for (const revealed of container.querySelectorAll('.reveal, .reveal-stagger')) {
      expect(revealed).not.toHaveAttribute('hidden');
      expect((revealed as HTMLElement).style.opacity).toBe('');
    }

    expect(screen.getByText('Програми тренувань — у таблицях і PDF')).toBeInTheDocument();
  });
});
