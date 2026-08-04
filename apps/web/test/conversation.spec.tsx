import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatHistory, ChatMessage } from '@gart/shared';

import { Conversation } from '@/components/chat/conversation';
import { ToastProvider } from '@/components/ui';

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  API_URL: 'http://api.test',
  ApiError: class extends Error {},
}));

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-1',
    senderRole: 'TRAINER',
    body: 'Привіт',
    createdAt: '2026-08-04T09:00:00.000Z',
    ...overrides,
  };
}

function history(overrides: Partial<ChatHistory> = {}): ChatHistory {
  return {
    threadId: 't-1',
    messages: [message(), message({ id: 'm-2', senderRole: 'CLIENT', body: 'Вітаю' })],
    nextBefore: null,
    unreadCount: 0,
    ...overrides,
  };
}

interface FetchInit {
  method?: string;
  body?: string;
}

function mockApi(result: ChatHistory = history()): void {
  apiFetch.mockImplementation((path: unknown, init?: FetchInit) => {
    const key = path as string;

    if (init?.method === 'POST' && key.endsWith('/messages')) {
      const sent = JSON.parse(init.body ?? '{}') as { body: string };

      return Promise.resolve(message({ id: 'm-new', senderRole: 'TRAINER', body: sent.body }));
    }
    if (init?.method === 'POST') {
      return Promise.resolve(null);
    }
    if (key.includes('/messages')) {
      return Promise.resolve(result);
    }

    return Promise.reject(new Error(`Unexpected call: ${key}`));
  });
}

function renderConversation() {
  return render(
    <ToastProvider>
      <Conversation threadId="t-1" mine="TRAINER" />
    </ToastProvider>,
  );
}

/** jsdom has no EventSource; the component treats that as «no live layer». */
class FakeEventSource {
  static last: FakeEventSource | undefined;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }

  close(): void {
    this.closed = true;
  }
}

describe('Conversation', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    Reflect.deleteProperty(globalThis, 'EventSource');
    FakeEventSource.last = undefined;
  });

  it('renders the history in reading order', async () => {
    mockApi();
    renderConversation();

    const list = await screen.findByRole('list', { name: 'Листування' });
    const items = within(list).getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Привіт');
    expect(items[1]).toHaveTextContent('Вітаю');
  });

  it('works with no real-time layer at all', async () => {
    mockApi();
    const user = userEvent.setup();
    renderConversation();

    await screen.findByText('Привіт');
    await user.type(screen.getByLabelText('Нове повідомлення'), 'Побачимось у четвер');
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(apiFetch).toHaveBeenCalledWith('/chat/threads/t-1/messages', {
      method: 'POST',
      body: JSON.stringify({ body: 'Побачимось у четвер' }),
    });
    expect(await screen.findByText('Побачимось у четвер')).toBeInTheDocument();
    expect(screen.getByLabelText('Нове повідомлення')).toHaveValue('');
  });

  it('sends on Enter and makes a new line on Shift+Enter', async () => {
    mockApi();
    const user = userEvent.setup();
    renderConversation();

    await screen.findByText('Привіт');
    const composer = screen.getByLabelText('Нове повідомлення');

    await user.type(composer, 'Рядок{Shift>}{Enter}{/Shift}Другий');
    expect(composer).toHaveValue('Рядок\nДругий');
    expect(apiFetch).not.toHaveBeenCalledWith(
      '/chat/threads/t-1/messages',
      expect.objectContaining({ method: 'POST' }),
    );

    await user.type(composer, '{Enter}');

    expect(apiFetch).toHaveBeenCalledWith('/chat/threads/t-1/messages', {
      method: 'POST',
      body: JSON.stringify({ body: 'Рядок\nДругий' }),
    });
  });

  it('refuses to send nothing', async () => {
    mockApi();
    const user = userEvent.setup();
    renderConversation();

    await screen.findByText('Привіт');
    expect(screen.getByRole('button', { name: 'Надіслати' })).toBeDisabled();

    await user.type(screen.getByLabelText('Нове повідомлення'), '   ');
    expect(screen.getByRole('button', { name: 'Надіслати' })).toBeDisabled();
  });

  it('announces incoming messages in a polite live region', async () => {
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      writable: true,
      value: FakeEventSource,
    });
    mockApi();
    renderConversation();

    const list = await screen.findByRole('list', { name: 'Листування' });
    expect(list).toHaveAttribute('aria-live', 'polite');
    expect(FakeEventSource.last?.url).toBe('http://api.test/chat/threads/t-1/stream');

    FakeEventSource.last?.onmessage?.({
      data: JSON.stringify({
        threadId: 't-1',
        message: message({ id: 'm-live', senderRole: 'CLIENT', body: 'Наживо' }),
      }),
    });

    expect(await screen.findByText('Наживо')).toBeInTheDocument();
  });

  it('does not duplicate a message that arrives twice', async () => {
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      writable: true,
      value: FakeEventSource,
    });
    mockApi();
    const user = userEvent.setup();
    renderConversation();

    await screen.findByText('Привіт');
    await user.type(screen.getByLabelText('Нове повідомлення'), 'Одне');
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));
    await screen.findByText('Одне');

    // The sender sees their own message from the POST and again from the
    // stream; the id keeps that idempotent.
    FakeEventSource.last?.onmessage?.({
      data: JSON.stringify({
        threadId: 't-1',
        message: message({ id: 'm-new', senderRole: 'TRAINER', body: 'Одне' }),
      }),
    });

    expect(screen.getAllByText('Одне')).toHaveLength(1);
  });

  it('marks the thread read when there is something unread', async () => {
    mockApi(history({ unreadCount: 2 }));
    renderConversation();

    await screen.findByText('Привіт');

    expect(apiFetch).toHaveBeenCalledWith('/chat/threads/t-1/read', { method: 'POST' });
  });

  it('invites the first message when there is none', async () => {
    mockApi(history({ messages: [] }));
    renderConversation();

    expect(await screen.findByText('Повідомлень ще немає. Напишіть перше.')).toBeInTheDocument();
  });
});
