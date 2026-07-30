import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeProvider } from '@/components/theme/theme-provider';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { THEME_COOKIE } from '@/lib/theme';

/** The provider is seeded by the server in the real app; 'system' is the default. */
function renderToggle() {
  return render(
    <ThemeProvider initial="system">
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    delete document.documentElement.dataset.theme;
    document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
  });

  async function open(): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: 'Тема оформлення' }));
  }

  it('adds the dark class and records the choice in a cookie', async () => {
    renderToggle();
    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: /Темна/ }));

    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
  });

  it('removes the dark class when switching back to light', async () => {
    renderToggle();

    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: /Темна/ }));
    expect(document.documentElement).toHaveClass('dark');

    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: /Світла/ }));

    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.cookie).toContain(`${THEME_COOKIE}=light`);
  });

  it('follows the system preference when set to system', async () => {
    renderToggle();
    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: /Як у системі/ }));

    // The setup file reports matchMedia as not-dark.
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.cookie).toContain(`${THEME_COOKIE}=system`);
  });

  it('exposes the menu state on the trigger', async () => {
    renderToggle();
    const trigger = screen.getByRole('button', { name: 'Тема оформлення' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await open();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on Escape', async () => {
    renderToggle();
    await open();

    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
