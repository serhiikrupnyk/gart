import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MESSAGE_MAX_LENGTH } from '@gart/shared';

import { MessageClient } from '@/components/clients/message-client';
import { ToastProvider } from '@/components/ui';

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  ApiError: class extends Error {},
}));

function renderCompose() {
  return render(
    <ToastProvider>
      <MessageClient clientId="c-1" clientName="Марія Бондаренко" />
    </ToastProvider>,
  );
}

async function openCompose(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();

  renderCompose();
  await user.click(screen.getByRole('button', { name: 'Написати клієнту' }));

  return user;
}

describe('MessageClient', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ sent: true });
  });

  it('sends the text to the client', async () => {
    const user = await openCompose();

    await user.type(screen.getByLabelText('Текст повідомлення'), 'Як самопочуття?');
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(apiFetch).toHaveBeenCalledWith('/clients/c-1/messages', {
      method: 'POST',
      body: JSON.stringify({ text: 'Як самопочуття?' }),
    });
    expect(await screen.findByText('Повідомлення надіслано')).toBeInTheDocument();
  });

  it('counts characters and refuses an over-long message before sending', async () => {
    const user = await openCompose();
    const field = screen.getByLabelText('Текст повідомлення');

    await user.type(field, 'Привіт');
    expect(screen.getByText(`6 / ${String(MESSAGE_MAX_LENGTH)}`)).toBeInTheDocument();

    await user.clear(field);
    // Paste rather than type: 501 keystrokes is a slow way to prove a rule.
    await user.click(field);
    await user.paste('я'.repeat(MESSAGE_MAX_LENGTH + 1));

    expect(screen.getByRole('button', { name: 'Надіслати' })).toBeDisabled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('will not send an empty or whitespace-only message', async () => {
    const user = await openCompose();

    expect(screen.getByRole('button', { name: 'Надіслати' })).toBeDisabled();

    await user.type(screen.getByLabelText('Текст повідомлення'), '   ');
    expect(screen.getByRole('button', { name: 'Надіслати' })).toBeDisabled();
  });

  it('closes and clears once sent', async () => {
    const user = await openCompose();

    await user.type(screen.getByLabelText('Текст повідомлення'), 'Побачимось у четвер');
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(await screen.findByText('Повідомлення надіслано')).toBeInTheDocument();
    expect(screen.queryByLabelText('Текст повідомлення')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Написати клієнту' }));
    expect(screen.getByLabelText('Текст повідомлення')).toHaveValue('');
  });

  it('keeps the text when sending fails, so nothing is lost', async () => {
    apiFetch.mockRejectedValue(new Error('nope'));
    const user = await openCompose();

    await user.type(screen.getByLabelText('Текст повідомлення'), 'Важливе');
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(await screen.findByText('Не вдалося надіслати повідомлення')).toBeInTheDocument();
    expect(screen.getByLabelText('Текст повідомлення')).toHaveValue('Важливе');
  });
});
