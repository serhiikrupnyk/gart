'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MESSAGE_BODY_MAX_LENGTH, type ChatMessage, type ChatRole } from '@gart/shared';

import { Button, Spinner, Textarea, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getHistory, markThreadRead, sendMessage, subscribeToThread } from '@/lib/chat';
import { cx } from '@/lib/cx';

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

/**
 * One conversation, shared by both hats — `mine` is simply which side the
 * viewer is on.
 *
 * The stream is an enhancement layered on top of plain HTTP: history and
 * sending work identically without it, so a browser that cannot hold an
 * EventSource, or a server that is not delivering, costs immediacy and nothing
 * else.
 */
export function Conversation({ threadId, mine }: { threadId: string; mine: ChatRole }) {
  const { notify } = useToast();

  const [messages, setMessages] = useState<ChatMessage[] | undefined>();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const append = useCallback((message: ChatMessage) => {
    setMessages((current) => {
      if (current === undefined) {
        return [message];
      }

      // The sender sees their own message from the POST response and again
      // from the stream; the id makes that idempotent.
      return current.some((existing) => existing.id === message.id)
        ? current
        : [...current, message];
    });
  }, []);

  useEffect(() => {
    let active = true;

    getHistory(threadId)
      .then((history) => {
        if (!active) return;

        setMessages(history.messages);

        if (history.unreadCount > 0) {
          void markThreadRead(threadId);
        }
      })
      .catch(() => {
        if (active) setMessages([]);
      });

    return () => {
      active = false;
    };
  }, [threadId]);

  useEffect(
    () =>
      subscribeToThread(threadId, (event) => {
        append(event.message);
        void markThreadRead(threadId);
      }),
    [threadId, append],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function submit(): Promise<void> {
    const text = body.trim();

    if (text === '' || text.length > MESSAGE_BODY_MAX_LENGTH) {
      return;
    }

    setPending(true);

    try {
      append(await sendMessage(threadId, text));
      setBody('');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Не вдалося надіслати', 'danger');
    } finally {
      setPending(false);
    }
  }

  if (messages === undefined) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="md" label="Завантаження листування" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Polite live region: incoming messages are announced without stealing
          focus from whatever the reader is doing. */}
      <ul
        aria-live="polite"
        aria-label="Листування"
        className="max-h-96 space-y-2 overflow-y-auto rounded-card border border-border bg-bg-subtle p-3"
      >
        {messages.length === 0 ? (
          <li className="py-6 text-center text-sm text-text-secondary">
            Повідомлень ще немає. Напишіть перше.
          </li>
        ) : (
          messages.map((message) => (
            <li
              key={message.id}
              className={cx('flex', message.senderRole === mine ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cx(
                  'max-w-[80%] rounded-card px-3 py-2',
                  message.senderRole === mine
                    ? 'bg-accent text-accent-contrast'
                    : 'bg-surface text-text',
                )}
              >
                <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                <p
                  className={cx(
                    'mt-0.5 text-2xs',
                    message.senderRole === mine ? 'text-accent-contrast/70' : 'text-text-secondary',
                  )}
                >
                  {formatTime(message.createdAt)}
                </p>
              </div>
            </li>
          ))
        )}
        <div ref={endRef} />
      </ul>

      <div className="mt-2 flex items-end gap-2">
        <Textarea
          rows={2}
          aria-label="Нове повідомлення"
          placeholder="Напишіть повідомлення…"
          value={body}
          invalid={body.trim().length > MESSAGE_BODY_MAX_LENGTH}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter makes a new line — what every chat does.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <Button
          variant="primary"
          loading={pending}
          disabled={body.trim() === '' || body.trim().length > MESSAGE_BODY_MAX_LENGTH}
          onClick={() => void submit()}
        >
          Надіслати
        </Button>
      </div>
    </div>
  );
}
