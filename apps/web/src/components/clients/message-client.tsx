'use client';

import { useState } from 'react';
import { MESSAGE_MAX_LENGTH } from '@gart/shared';

import { Button, Modal, Textarea, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { sendClientMessage } from '@/lib/messages';

/**
 * «Написати клієнту» — the action an inactivity alert exists to prompt. The
 * message reaches the client's notification panel, and their device too if
 * they have allowed push.
 */
export function MessageClient({ clientId, clientName }: { clientId: string; clientName: string }) {
  const { notify } = useToast();

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);

  const trimmed = text.trim();
  const tooLong = trimmed.length > MESSAGE_MAX_LENGTH;

  async function send(): Promise<void> {
    setPending(true);

    try {
      await sendClientMessage(clientId, trimmed);
      notify('Повідомлення надіслано', 'success');
      setText('');
      setOpen(false);
    } catch (error) {
      notify(
        error instanceof ApiError ? error.message : 'Не вдалося надіслати повідомлення',
        'danger',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true);
        }}
      >
        Написати клієнту
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={`Написати: ${clientName}`}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setOpen(false);
              }}
            >
              Скасувати
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={trimmed === '' || tooLong}
              onClick={() => void send()}
            >
              Надіслати
            </Button>
          </>
        }
      >
        <Textarea
          rows={4}
          aria-label="Текст повідомлення"
          placeholder="Наприклад: як самопочуття? Побачимось у четвер?"
          value={text}
          invalid={tooLong}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <p className="mt-1 text-right text-xs text-text-secondary">
          {trimmed.length} / {MESSAGE_MAX_LENGTH}
        </p>
      </Modal>
    </>
  );
}
