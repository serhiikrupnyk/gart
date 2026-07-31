'use client';

import {
  MEDIA_KIND_LABELS,
  MEDIA_RULES,
  type ExerciseMediaInfo,
  type MediaKind,
} from '@gart/shared';

import { Button } from '@/components/ui';

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/** Pre-check mirroring the API rules exactly — fast feedback, API stays the authority. */
export function validateMediaFile(kind: MediaKind, file: File): string | undefined {
  const rules = MEDIA_RULES[kind];

  if (!rules.contentTypes.includes(file.type)) {
    return kind === 'VIDEO'
      ? 'Непідтримуваний тип відео (дозволено MP4 або WebM)'
      : 'Непідтримуваний тип аудіо (дозволено MP3 або M4A)';
  }

  if (file.size > rules.maxSizeBytes) {
    return `Файл завеликий — до ${String(Math.round(rules.maxSizeBytes / (1024 * 1024)))} МБ`;
  }

  return undefined;
}

export interface MediaUploadFieldProps {
  kind: MediaKind;
  /** Already-stored rendition, when editing. */
  existing: ExerciseMediaInfo | undefined;
  /** File staged for upload on save. */
  staged: File | undefined;
  onStage: (file: File | undefined) => void;
  onRemoveExisting?: (kind: MediaKind) => void;
  error?: string | undefined;
  /** 0..1 while the direct upload runs. */
  progress?: number | undefined;
  disabled?: boolean;
}

/**
 * One rendition slot: shows the stored file, a staged replacement, or a picker.
 * Files are only staged here — the presign→PUT→finalize run happens on save,
 * once the exercise row exists to presign against.
 */
export function MediaUploadField({
  kind,
  existing,
  staged,
  onStage,
  onRemoveExisting,
  error,
  progress,
  disabled = false,
}: MediaUploadFieldProps) {
  const label = MEDIA_KIND_LABELS[kind];
  const accept = MEDIA_RULES[kind].contentTypes.join(',');
  const inputId = `media-file-${kind}`;

  return (
    <div className="rounded-card border border-border bg-bg-subtle px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm">
          <span className="font-medium text-text">{label}</span>
          {staged !== undefined ? (
            <span className="ml-2 text-text-secondary">
              {staged.name} · {formatSize(staged.size)}
            </span>
          ) : existing !== undefined ? (
            <span className="ml-2 text-text-secondary">
              завантажено · {formatSize(existing.sizeBytes)}
            </span>
          ) : (
            <span className="ml-2 text-text-secondary">немає</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {staged !== undefined ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                onStage(undefined);
              }}
            >
              Скасувати
            </Button>
          ) : (
            <>
              <label
                htmlFor={inputId}
                className={`inline-flex h-8 cursor-pointer items-center rounded-control border border-border-strong bg-surface px-3 text-sm font-medium text-text transition-colors hover:bg-bg-subtle has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${disabled ? 'pointer-events-none opacity-60' : ''}`}
              >
                {existing !== undefined ? 'Замінити' : 'Обрати файл'}
                <input
                  id={inputId}
                  type="file"
                  accept={accept}
                  disabled={disabled}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    onStage(file ?? undefined);
                    // Allow re-selecting the same file after cancelling.
                    event.target.value = '';
                  }}
                />
              </label>

              {existing !== undefined && onRemoveExisting !== undefined && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    onRemoveExisting(kind);
                  }}
                >
                  Прибрати
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {progress !== undefined && (
        <div
          role="progressbar"
          aria-label={`Завантаження: ${label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${String(Math.round(progress * 100))}%` }}
          />
        </div>
      )}

      {error !== undefined && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
