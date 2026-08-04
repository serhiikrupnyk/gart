import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatHistory, ChatMessage } from '@gart/shared';

import { Conversation } from '@/components/chat/conversation';
import { MessageText } from '@/components/chat/message-text';
import { ToastProvider } from '@/components/ui';

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  API_URL: 'http://api.test',
  ApiError: class extends Error {},
}));

const uploadToStorage = jest.fn();
jest.mock('@/lib/upload', () => ({
  uploadToStorage: (...args: unknown[]) => uploadToStorage(...args) as unknown,
}));

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-1',
    senderRole: 'TRAINER',
    body: 'Привіт',
    attachment: null,
    createdAt: '2026-08-04T09:00:00.000Z',
    ...overrides,
  };
}

function history(messages: ChatMessage[]): ChatHistory {
  return { threadId: 't-1', messages, nextBefore: null, unreadCount: 0 };
}

interface FetchInit {
  method?: string;
  body?: string;
}

function mockApi(messages: ChatMessage[] = [message()]): void {
  apiFetch.mockImplementation((path: unknown, init?: FetchInit) => {
    const key = path as string;

    if (key.endsWith('/attachments/presign')) {
      return Promise.resolve({
        uploadUrl: 'https://storage.test/put/chat/t-1/abc.jpg',
        key: 'chat/t-1/abc.jpg',
        expiresAt: '2099-01-01',
      });
    }
    if (key.includes('/attachments/') && key.endsWith('/url')) {
      return Promise.resolve({ url: 'https://storage.test/get/abc', expiresAt: '2099-01-01' });
    }
    if (init?.method === 'POST' && key.endsWith('/messages')) {
      const sent = JSON.parse(init.body ?? '{}') as { body: string };

      return Promise.resolve(message({ id: 'm-new', body: sent.body }));
    }
    if (init?.method === 'POST') {
      return Promise.resolve(null);
    }
    if (key.includes('/messages')) {
      return Promise.resolve(history(messages));
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

function lastWrite(path: string): FetchInit | undefined {
  const calls = apiFetch.mock.calls as [string, FetchInit | undefined][];

  return calls.filter(([called]) => called === path).at(-1)?.[1];
}

describe('chat media', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    uploadToStorage.mockReset();
    uploadToStorage.mockResolvedValue(undefined);
    Reflect.deleteProperty(globalThis, 'EventSource');
    Reflect.deleteProperty(globalThis, 'MediaRecorder');
  });

  it('uploads a picked image through presign, PUT, then send', async () => {
    mockApi();
    const user = userEvent.setup();
    const { container } = renderConversation();

    await screen.findByText('Привіт');

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }));

    expect(lastWrite('/chat/threads/t-1/attachments/presign')?.body).toBe(
      JSON.stringify({ kind: 'IMAGE', contentType: 'image/jpeg', sizeBytes: 5 }),
    );
    expect(uploadToStorage).toHaveBeenCalledWith(
      'https://storage.test/put/chat/t-1/abc.jpg',
      expect.any(Blob),
      expect.any(Function),
    );
    expect(JSON.parse(lastWrite('/chat/threads/t-1/messages')?.body ?? '{}')).toEqual({
      body: '',
      attachment: { key: 'chat/t-1/abc.jpg', kind: 'IMAGE' },
    });
  });

  it('refuses an oversized file before anything leaves the device', async () => {
    mockApi();
    const user = userEvent.setup();
    const { container } = renderConversation();

    await screen.findByText('Привіт');

    const huge = new File(['x'], 'huge.jpg', { type: 'image/jpeg' });
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 });

    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, huge);

    expect(await screen.findByText('Файл завеликий')).toBeInTheDocument();
    expect(uploadToStorage).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalledWith(
      '/chat/threads/t-1/attachments/presign',
      expect.anything(),
    );
  });

  it('fetches an attachment URL only when it is opened', async () => {
    mockApi([
      message({
        body: '',
        attachment: {
          id: 'a-1',
          kind: 'IMAGE',
          contentType: 'image/jpeg',
          sizeBytes: 2048,
          durationSeconds: null,
        },
      }),
    ]);
    const user = userEvent.setup();
    renderConversation();

    const open = await screen.findByRole('button', { name: /Фото.*відкрити/ });
    expect(apiFetch).not.toHaveBeenCalledWith('/chat/attachments/a-1/url');

    await user.click(open);

    expect(apiFetch).toHaveBeenCalledWith('/chat/attachments/a-1/url');
    expect(await screen.findByAltText('Фото')).toHaveAttribute(
      'src',
      'https://storage.test/get/abc',
    );
  });

  it('loads a voice note only on play, and shows its length first', async () => {
    mockApi([
      message({
        body: '',
        attachment: {
          id: 'a-2',
          kind: 'VOICE',
          contentType: 'audio/webm',
          sizeBytes: 2048,
          durationSeconds: 75,
        },
      }),
    ]);
    const user = userEvent.setup();
    const { container } = renderConversation();

    const play = await screen.findByRole('button', { name: /Голосове повідомлення.*відкрити/ });
    expect(within(play).getByText('1:15')).toBeInTheDocument();
    expect(container.querySelector('audio')).not.toBeInTheDocument();

    await user.click(play);

    expect(container.querySelector('audio')).toBeInTheDocument();
  });

  it('offers no recorder in a browser that cannot record', async () => {
    mockApi();
    renderConversation();

    await screen.findByText('Привіт');

    expect(
      screen.queryByRole('button', { name: 'Записати голосове повідомлення' }),
    ).not.toBeInTheDocument();
  });
});

describe('MessageText', () => {
  it('links http and https, and opens them safely', () => {
    render(<MessageText body="Дивись https://example.com/plan та http://gart.fit" />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://example.com/plan');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(links[0]).toHaveAttribute('target', '_blank');
  });

  it('never turns a dangerous scheme into a link', () => {
    render(<MessageText body="javascript:alert(1) data:text/html,<b>x</b> file:///etc/passwd" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/javascript:alert\(1\)/)).toBeInTheDocument();
  });

  it('builds a preview by fetching nothing at all', () => {
    // jsdom provides no fetch, so install one purely to prove it stays unused.
    const fetchSpy = jest.fn();

    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchSpy });

    render(<MessageText body="https://example.com" />);

    // No unfurling: there is no server-side fetch to be tricked into probing
    // an internal address, and no client-side one either.
    expect(fetchSpy).not.toHaveBeenCalled();
    Reflect.deleteProperty(globalThis, 'fetch');
  });
});
