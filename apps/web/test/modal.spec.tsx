import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button, Modal } from '@/components/ui';

function Fixture({ onClose }: { onClose: () => void }) {
  return (
    <>
      <button type="button">поза модалкою</button>
      <Modal open onClose={onClose} title="Додати клієнта">
        <input aria-label="Ім'я" />
        <input aria-label="Email" />
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('is a labelled modal dialog', () => {
    render(<Fixture onClose={jest.fn()} />);

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Додати клієнта');
  });

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={jest.fn()} title="Прихована">
        <p>вміст</p>
      </Modal>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves focus to the first control when it opens', () => {
    render(<Fixture onClose={jest.fn()} />);

    expect(screen.getByLabelText("Ім'я")).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const onClose = jest.fn();
    render(<Fixture onClose={onClose} />);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog', async () => {
    render(<Fixture onClose={jest.fn()} />);

    const name = screen.getByLabelText("Ім'я");
    const email = screen.getByLabelText('Email');
    const close = screen.getByRole('button', { name: 'Закрити' });

    expect(name).toHaveFocus();

    await userEvent.tab();
    expect(email).toHaveFocus();

    // Past the last control, focus wraps round to the first thing in the dialog
    // — the close button — rather than escaping to the page behind it.
    await userEvent.tab();
    expect(close).toHaveFocus();
    expect(screen.getByRole('button', { name: 'поза модалкою' })).not.toHaveFocus();
  });

  it('wraps backwards from the first control', async () => {
    render(<Fixture onClose={jest.fn()} />);

    expect(screen.getByLabelText("Ім'я")).toHaveFocus();

    await userEvent.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'поза модалкою' })).not.toHaveFocus();
  });

  it('restores focus to the opener when it unmounts', async () => {
    function Toggle() {
      return (
        <>
          <Button onClick={jest.fn()}>відкривач</Button>
        </>
      );
    }

    const { unmount } = render(<Toggle />);
    const opener = screen.getByRole('button', { name: 'відкривач' });
    opener.focus();

    const modal = render(
      <Modal open onClose={jest.fn()} title="Тест">
        <input aria-label="поле" />
      </Modal>,
    );

    expect(screen.getByLabelText('поле')).toHaveFocus();

    modal.unmount();
    expect(opener).toHaveFocus();

    unmount();
  });
});
