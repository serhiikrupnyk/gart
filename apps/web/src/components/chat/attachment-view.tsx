'use client';

import { useState } from 'react';
import { CHAT_ATTACHMENT_LABELS, type ChatAttachmentInfo } from '@gart/shared';

import { Button, Modal, useToast } from '@/components/ui';
import { getAttachmentUrl } from '@/lib/chat';

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);

  return megabytes >= 1 ? `${megabytes.toFixed(1)} МБ` : `${String(Math.ceil(bytes / 1024))} КБ`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);

  return `${String(minutes)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * An attachment in a bubble. Nothing is fetched until somebody opens or plays
 * it — a conversation full of photos must not cost a conversation full of
 * downloads, which is the egress lesson from the exercise library.
 */
export function AttachmentView({ attachment }: { attachment: ChatAttachmentInfo }) {
  const { notify } = useToast();
  const [url, setUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  const label = CHAT_ATTACHMENT_LABELS[attachment.kind];

  async function load(): Promise<void> {
    if (url !== undefined) {
      return;
    }

    setLoading(true);

    try {
      setUrl((await getAttachmentUrl(attachment.id)).url);
    } catch {
      notify('Не вдалося завантажити вкладення', 'danger');
    } finally {
      setLoading(false);
    }
  }

  if (url === undefined) {
    return (
      <Button
        variant="secondary"
        size="sm"
        loading={loading}
        onClick={() => void load()}
        aria-label={`${label}, ${formatSize(attachment.sizeBytes)} — відкрити`}
      >
        {label}
        <span className="text-text-secondary">
          {attachment.durationSeconds === null
            ? formatSize(attachment.sizeBytes)
            : formatDuration(attachment.durationSeconds)}
        </span>
      </Button>
    );
  }

  if (attachment.kind === 'VOICE') {
    return <audio controls autoPlay src={url} aria-label={label} className="w-56 max-w-full" />;
  }

  if (attachment.kind === 'VIDEO') {
    return (
      <video
        controls
        autoPlay
        src={url}
        aria-label={label}
        className="max-h-72 w-full rounded-card bg-black"
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setEnlarged(true);
        }}
        aria-label="Відкрити фото"
      >
        {/* Plain <img>: the source is a short-lived signed URL that next/image
            would need per-domain configuration to accept. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="max-h-64 rounded-card" />
      </button>

      <Modal
        open={enlarged}
        onClose={() => {
          setEnlarged(false);
        }}
        title={label}
        size="lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="w-full" />
      </Modal>
    </>
  );
}
