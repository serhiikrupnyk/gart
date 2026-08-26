'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import {
  BRAND_LOGO_RULES,
  BRAND_NAME_MAX_LENGTH,
  isBrandColor,
  type BrandSettings,
} from '@gart/shared';

import { BrandMark } from '@/components/branding/brand-mark';
import { PageHeader } from '@/components/layout/page-header';
import { Button, Card, FormField, Input, Label, RowsSkeleton, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import {
  checkLogoFile,
  getBrand,
  removeBrandLogo,
  updateBrand,
  uploadBrandLogo,
} from '@/lib/brand-api';
import { BRAND, brandLogoSrc, brandStyle } from '@/lib/brand';

/** The one colour the picker starts from when a trainer has never chosen. */
const DEFAULT_SWATCH = '#ff5b32';

/**
 * White-label settings: what this trainer's own clients see instead of Gart.
 *
 * Laptop-first, because it is set once and rarely revisited — but the preview
 * beside it is the client's PHONE header, since that is where the result
 * actually lands and a trainer should not have to imagine it.
 */
export default function BrandPage() {
  const { notify } = useToast();

  const [brand, setBrand] = useState<BrandSettings>();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    getBrand()
      .then((loaded) => {
        if (!active) return;
        setBrand(loaded);
        setName(loaded.brandName ?? '');
        // The picker cannot show «nothing», so it starts on the app's own
        // accent — and `color` has to hold what the picker SHOWS, or a trainer
        // who accepts the swatch without opening it would save a null and see
        // no change anywhere, since the default is that same accent.
        setColor(loaded.brandColor ?? DEFAULT_SWATCH);
      })
      .catch((error: unknown) => {
        if (!active) return;
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити бренд',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [reloadKey, notify]);

  async function save(next: { brandName?: string | null; brandColor?: string | null }) {
    setSaving(true);

    try {
      setBrand(await updateBrand(next));
      notify('Збережено', 'success');
    } catch (error: unknown) {
      notify(error instanceof ApiError ? error.message : 'Не вдалося зберегти', 'danger');
      setReloadKey((key) => key + 1);
    } finally {
      setSaving(false);
    }
  }

  function pickLogo(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    // Reset immediately so choosing the same file twice still fires a change.
    event.target.value = '';

    if (file === undefined) return;

    const problem = checkLogoFile(file);

    if (problem !== undefined) {
      notify(problem, 'danger');

      return;
    }

    setUploading(true);
    uploadBrandLogo(file)
      .then((updated) => {
        setBrand(updated);
        notify('Логотип оновлено', 'success');
      })
      .catch((error: unknown) => {
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити логотип',
          'danger',
        );
      })
      .finally(() => {
        setUploading(false);
      });
  }

  if (brand === undefined) {
    return (
      <>
        <PageHeader title="Бренд" description="Те, що бачать ваші клієнти замість Gart." />
        <RowsSkeleton count={3} />
      </>
    );
  }

  // The preview shows the SAVED colour until a change is saved, except while
  // the picker is being moved — so what a trainer sees is what their clients
  // would get, not what they are considering.
  const previewColor = color !== null && isBrandColor(color) ? color : null;

  return (
    <>
      <PageHeader
        title="Бренд"
        description="Назва, логотип і колір, які бачать ваші клієнти у своєму застосунку."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-base font-bold tracking-[-0.02em] text-text">Назва</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              Замінює «Gart» у застосунку ваших клієнтів. Порожньо — і вони бачитимуть ваше ім’я.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <FormField
                  label="Назва бренду"
                  hint={`До ${String(BRAND_NAME_MAX_LENGTH)} символів.`}
                >
                  {(props) => (
                    <Input
                      {...props}
                      value={name}
                      maxLength={BRAND_NAME_MAX_LENGTH}
                      placeholder={brand.displayName}
                      onChange={(event) => {
                        setName(event.target.value);
                      }}
                      disabled={saving}
                    />
                  )}
                </FormField>
              </div>
              <Button
                variant="secondary"
                loading={saving}
                onClick={() => {
                  void save({ brandName: name.trim() === '' ? null : name.trim() });
                }}
              >
                Зберегти
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-bold tracking-[-0.02em] text-text">Логотип</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              JPEG, PNG або WebP, до {String(Math.round(BRAND_LOGO_RULES.maxSizeBytes / 1024))} КБ.
              Квадратний виглядає найкраще.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {brand.brandLogoUrl !== null && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brandLogoSrc(brand.brandLogoUrl) ?? undefined}
                  alt="Ваш логотип"
                  className="size-14 rounded-full object-cover ring-1 ring-inset ring-black/10"
                />
              )}

              <input
                ref={fileInput}
                type="file"
                accept={BRAND_LOGO_RULES.contentTypes.join(',')}
                className="sr-only"
                onChange={pickLogo}
              />
              <Button
                variant="secondary"
                loading={uploading}
                onClick={() => {
                  fileInput.current?.click();
                }}
              >
                <ImageUp className="size-4" aria-hidden="true" />
                {brand.brandLogoUrl === null ? 'Завантажити логотип' : 'Замінити'}
              </Button>

              {brand.brandLogoUrl !== null && (
                <Button
                  variant="ghost"
                  disabled={uploading}
                  onClick={() => {
                    void removeBrandLogo()
                      .then(setBrand)
                      .catch(() => {
                        notify('Не вдалося видалити логотип', 'danger');
                      });
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Видалити
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-bold tracking-[-0.02em] text-text">Колір</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              Використовується лише як акцент — смужки, позначки, підсвітки. Текст ніколи не
              друкується вашим кольором, тому застосунок читається за будь-якого вибору.
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="brand-color">Колір бренду</Label>
                <input
                  id="brand-color"
                  type="color"
                  value={color ?? DEFAULT_SWATCH}
                  onChange={(event) => {
                    setColor(event.target.value);
                  }}
                  className="mt-1.5 h-11 w-20 cursor-pointer rounded-control border border-border-strong bg-surface p-1"
                />
              </div>
              <Button
                variant="secondary"
                loading={saving}
                onClick={() => {
                  void save({ brandColor: color });
                }}
              >
                Зберегти
              </Button>
              {brand.brandColor !== null && (
                <Button
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setColor(DEFAULT_SWATCH);
                    void save({ brandColor: null });
                  }}
                >
                  Скинути
                </Button>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 lg:h-fit">
          <Card>
            <h2 className="text-base font-bold tracking-[-0.02em] text-text">
              Як це бачить клієнт
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              Шапка застосунку на телефоні.
            </p>

            <div
              className="mt-4 overflow-hidden rounded-panel border border-border bg-bg"
              style={brandStyle(previewColor)}
            >
              <span
                aria-hidden="true"
                className="block h-[3px]"
                style={{ backgroundColor: BRAND }}
              />
              <div className="flex items-center gap-3 px-4 py-3.5">
                <BrandMark
                  displayName={brand.displayName}
                  brandName={name.trim() === '' ? null : name.trim()}
                  brandLogoUrl={brand.brandLogoUrl}
                  brandColor={previewColor}
                />
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-text-muted">
              У застосунку клієнта внизу залишається невеликий підпис «Працює на Gart».
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
