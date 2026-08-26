import { render, screen, within } from '@testing-library/react';

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
    expect(headings[0]).toHaveTextContent('Тренуйте людей, а не таблиці.');
  });

  it('sends the primary CTAs to registration and the secondary to login', () => {
    renderLanding();

    const register = screen.getAllByRole('link', { name: /Спробувати безкоштовно/ });

    expect(register.length).toBeGreaterThanOrEqual(2);
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
      'Знайоме?',
      'Все, що потрібно тренеру. В одному місці.',
      'Для кого Gart',
      'Чому Gart, а не глобальні сервіси',
      'Тренери про Gart',
      'Менше адмінки. Більше тренувань.',
    ]) {
      expect(screen.getByRole('heading', { name: heading, level: 2 })).toBeInTheDocument();
    }
  });

  it('promises nothing it will not do', () => {
    renderLanding();

    // Gart does not sit between a client and their trainer: they settle
    // payments between themselves, and the marketing must not say otherwise.
    const body = document.body.textContent ?? '';

    expect(body).not.toContain('ФОП');
    expect(body).not.toContain('спліт');
    expect(body).not.toContain('скинь на картку');
    expect(screen.queryByRole('heading', { name: /Українські оплати/ })).not.toBeInTheDocument();

    // Nutrition is Phase 4: promised in the roadmap strip, never as a feature.
    expect(screen.getByText(/Попереду: харчування/)).toBeInTheDocument();
  });

  it('shows the honest social-proof placeholder, with no invented trainers', () => {
    renderLanding();

    expect(
      screen.getByText('Ми збираємо перші історії тренерів — чесно, без вигаданих відгуків.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Стати одним із перших' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('keeps the product shot decorative rather than reading numbers aloud', () => {
    const { container } = renderLanding();

    // Every figure in the composition is also stated in the copy beside it.
    const shot = container.querySelector('[aria-hidden="true"] .shadow-e4');

    expect(shot?.closest('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.queryByText('5×5 · 82,5 кг')).not.toBeNull();
  });

  it('never hides content behind the scroll reveal', () => {
    const { container } = renderLanding();

    // The reveal is CSS-only and opt-in via @supports, so revealed regions must
    // carry no inline hiding — an unsupported browser has to see them.
    for (const revealed of container.querySelectorAll('.reveal, .reveal-stagger')) {
      expect(revealed).not.toHaveAttribute('hidden');
      expect((revealed as HTMLElement).style.opacity).toBe('');
    }

    // And the content inside them is queryable, not stripped.
    expect(screen.getByText('Програми — в Excel і PDF')).toBeInTheDocument();
  });

  it('makes no API call whatsoever', () => {
    renderLanding();

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('keeps the anchor nav pointing at real sections', () => {
    renderLanding();

    const nav = screen.getByRole('navigation', { name: 'Розділи сторінки' });

    for (const [label, id] of [
      ['Можливості', 'mozhlyvosti'],
      ['Для кого', 'dlia-koho'],
      ['Чому Gart', 'chomu-gart'],
    ] as const) {
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', `#${id}`);
      expect(document.getElementById(id)).toBeInTheDocument();
    }
  });

  it('has a footer with the essential links', () => {
    renderLanding();

    const footer = screen.getByRole('navigation', { name: 'Футер' });

    expect(within(footer).getByRole('link', { name: 'Увійти' })).toHaveAttribute('href', '/login');
    expect(within(footer).getByRole('link', { name: 'Зареєструватися' })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});
