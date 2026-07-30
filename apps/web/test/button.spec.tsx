import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from '@/components/ui';

describe('Button', () => {
  it('renders a real button that is not submit by default', () => {
    render(<Button>Зберегти</Button>);

    expect(screen.getByRole('button', { name: 'Зберегти' })).toHaveAttribute('type', 'button');
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'renders the %s variant',
    (variant) => {
      render(<Button variant={variant}>Дія</Button>);

      expect(screen.getByRole('button', { name: 'Дія' })).toBeInTheDocument();
    },
  );

  it('blocks interaction and announces itself while loading', async () => {
    const onClick = jest.fn();
    render(
      <Button loading onClick={onClick}>
        Зберігаємо
      </Button>,
    );

    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not fire when disabled', async () => {
    const onClick = jest.fn();
    render(
      <Button disabled onClick={onClick}>
        Дія
      </Button>,
    );

    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
