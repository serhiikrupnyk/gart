'use client';

import { useState } from 'react';
import { MEDIA_KIND_LABELS, type ExerciseMediaInfo } from '@gart/shared';

import { Button, useToast } from '@/components/ui';
import { getMediaUrl } from '@/lib/exercises';

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);

  return megabytes >= 1 ? `${megabytes.toFixed(1)} МБ` : `${String(Math.ceil(bytes / 1024))} КБ`;
}

interface LoadedMedia {
  url: string;
}

/**
 * Click-to-load, per the cost model: nothing is fetched until the trainer asks
 * to play, because every play re-streams the clip. The presigned URL is
 * re-fetched when it has expired, and once more if the element errors — a URL
 * can outlive its signature mid-session.
 */
export function MediaPlayer({
  exerciseId,
  media,
}: {
  exerciseId: string;
  media: ExerciseMediaInfo;
}) {
  const { notify } = useToast();
  const [loaded, setLoaded] = useState<LoadedMedia | undefined>();
  const [loading, setLoading] = useState(false);
  const [retried, setRetried] = useState(false);

  async function fetchUrl(): Promise<void> {
    setLoading(true);

    try {
      const response = await getMediaUrl(exerciseId, media.kind);
      setLoaded({ url: response.url });
    } catch {
      notify('Не вдалося завантажити медіа', 'danger');
    } finally {
      setLoading(false);
    }
  }

  function handleElementError(): void {
    // One silent refresh — the signature may simply have expired under us.
    if (!retried) {
      setRetried(true);
      void fetchUrl();
      return;
    }
    setLoaded(undefined);
    notify('Не вдалося відтворити медіа', 'danger');
  }

  const label = MEDIA_KIND_LABELS[media.kind];

  // The element only ever mounts with a freshly fetched URL; if the signature
  // expires while the modal idles, playback errors and handleElementError
  // re-fetches once — no clock reads during render.
  if (loaded === undefined) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-bg-subtle px-4 py-3">
        <span className="min-w-0 text-sm text-text">
          {label}
          <span className="ml-2 text-text-secondary">{formatSize(media.sizeBytes)}</span>
        </span>

        <Button variant="secondary" size="sm" loading={loading} onClick={() => void fetchUrl()}>
          {loading ? 'Завантаження…' : 'Відтворити'}
        </Button>
      </div>
    );
  }

  return media.kind === 'VIDEO' ? (
    <video
      controls
      autoPlay
      src={loaded.url}
      onError={handleElementError}
      className="max-h-80 w-full rounded-card border border-border bg-black"
    />
  ) : (
    <audio controls autoPlay src={loaded.url} onError={handleElementError} className="w-full" />
  );
}
