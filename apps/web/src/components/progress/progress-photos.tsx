'use client';

import { useState } from 'react';
import { PROGRESS_PHOTO_RULES, type ProgressPhotoInfo } from '@gart/shared';

import { Button, Modal, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import {
  deleteProgressPhoto,
  finalizeProgressPhoto,
  getProgressPhotoUrl,
  presignProgressPhoto,
} from '@/lib/progress';
import { localDateString } from '@/lib/dates';
import { uploadToStorage } from '@/lib/upload';
import { formatShortDate } from '@/lib/workout-format';

/**
 * The private gallery. Nothing is fetched until a photo is opened — the same
 * egress discipline exercise media follows, and the same private-by-default
 * model: the URL is minted per view and expires.
 */
export function ProgressPhotos({
  clientId,
  photos,
  canManage,
  onChanged,
}: {
  clientId: string;
  photos: ProgressPhotoInfo[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const { notify } = useToast();

  const [open, setOpen] = useState<{ photo: ProgressPhotoInfo; url: string } | undefined>();
  const [compare, setCompare] = useState<{ first: string; second: string } | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  async function view(photo: ProgressPhotoInfo): Promise<void> {
    try {
      const { url } = await getProgressPhotoUrl(photo.id);
      setOpen({ photo, url });
    } catch {
      notify('Не вдалося відкрити фото', 'danger');
    }
  }

  /** Before/after: two chosen photos, side by side, each freshly signed. */
  async function openCompare(): Promise<void> {
    const [firstId, secondId] = selected;

    if (firstId === undefined || secondId === undefined) return;

    try {
      const [first, second] = await Promise.all([
        getProgressPhotoUrl(firstId),
        getProgressPhotoUrl(secondId),
      ]);
      setCompare({ first: first.url, second: second.url });
    } catch {
      notify('Не вдалося відкрити фото', 'danger');
    }
  }

  async function upload(file: File): Promise<void> {
    if (!PROGRESS_PHOTO_RULES.contentTypes.includes(file.type)) {
      notify('Підтримуються лише зображення JPEG, PNG або WebP', 'danger');
      return;
    }
    if (file.size > PROGRESS_PHOTO_RULES.maxSizeBytes) {
      notify('Файл завеликий', 'danger');
      return;
    }

    setUploading(true);

    try {
      const presigned = await presignProgressPhoto(clientId, {
        contentType: file.type,
        sizeBytes: file.size,
      });

      await uploadToStorage(presigned.uploadUrl, file, () => undefined);
      await finalizeProgressPhoto(clientId, {
        key: presigned.key,
        date: localDateString(new Date()),
      });

      notify('Фото додано', 'success');
      onChanged();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Не вдалося завантажити фото', 'danger');
    } finally {
      setUploading(false);
    }
  }

  function toggleSelected(id: string): void {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : // Two at a time: the older selection drops out.
          [...current, id].slice(-2),
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-bold tracking-[-0.03em] text-text">Фото прогресу</h3>

        <div className="flex items-center gap-2">
          {selected.length === 2 && (
            <Button variant="secondary" size="sm" onClick={() => void openCompare()}>
              Порівняти
            </Button>
          )}
          {canManage && (
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-border-strong bg-surface px-3 text-sm font-medium text-text hover:bg-bg-subtle">
              {uploading ? 'Завантаження…' : 'Додати фото'}
              <input
                type="file"
                accept={PROGRESS_PHOTO_RULES.contentTypes.join(',')}
                disabled={uploading}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  event.target.value = '';

                  if (file !== undefined) void upload(file);
                }}
              />
            </label>
          )}
        </div>
      </div>

      {photos.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">Фото ще немає.</p>
      ) : (
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="rounded-card border border-border bg-surface p-3 shadow-e1"
            >
              <button
                type="button"
                onClick={() => void view(photo)}
                className="min-h-11 w-full text-left text-sm font-medium text-text hover:text-accent"
              >
                {formatShortDate(photo.date)}
              </button>
              {photo.label !== null && <p className="text-xs text-text-secondary">{photo.label}</p>}

              <label className="mt-1 flex cursor-pointer items-center gap-1 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={selected.includes(photo.id)}
                  onChange={() => {
                    toggleSelected(photo.id);
                  }}
                />
                Для порівняння
              </label>

              {canManage && (
                <button
                  type="button"
                  onClick={() =>
                    void deleteProgressPhoto(photo.id)
                      .then(onChanged)
                      .catch(() => {
                        notify('Не вдалося видалити фото', 'danger');
                      })
                  }
                  className="mt-1 min-h-11 text-xs text-text-secondary hover:text-danger"
                >
                  Видалити
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open !== undefined}
        onClose={() => {
          setOpen(undefined);
        }}
        title={open === undefined ? '' : formatShortDate(open.photo.date)}
        size="lg"
      >
        {open !== undefined && (
          // Plain <img>: the source is a short-lived signed URL that next/image
          // would need per-domain configuration to accept.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={open.url} alt={open.photo.label ?? 'Фото прогресу'} className="w-full" />
        )}
      </Modal>

      <Modal
        open={compare !== undefined}
        onClose={() => {
          setCompare(undefined);
        }}
        title="Порівняння"
        size="lg"
      >
        {compare !== undefined && (
          <div className="grid grid-cols-2 gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={compare.first} alt="Перше фото" className="w-full" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={compare.second} alt="Друге фото" className="w-full" />
          </div>
        )}
      </Modal>
    </div>
  );
}
