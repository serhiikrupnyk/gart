'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { MealPage, NutritionStatus, PublicMeal } from '@gart/shared';

import { MealFormModal } from '@/components/nutrition/meal-form-modal';
import { NutrientSummary } from '@/components/nutrition/nutrient-summary';
import { NutritionTabs } from '@/components/nutrition/nutrition-tabs';
import { NutritionUpsell } from '@/components/nutrition/nutrition-upsell';
import { PageHeader } from '@/components/layout/page-header';
import { Button, Card, EmptyState, Input, Modal, RowsSkeleton, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { deleteMeal, listMeals } from '@/lib/meals';
import { getNutritionStatus } from '@/lib/nutrition';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type FormState = { open: false } | { open: true; meal?: PublicMeal };

export default function MealsPage() {
  const { notify } = useToast();

  const [status, setStatus] = useState<NutritionStatus>();
  const [data, setData] = useState<MealPage>();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState>({ open: false });
  const [deleting, setDeleting] = useState<PublicMeal>();
  const [removing, setRemoving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    let active = true;

    getNutritionStatus()
      .then((loaded) => {
        if (active) setStatus(loaded);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus({ available: false, customFoodCount: 0, requiredPlan: 'GROW' });
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити харчування',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [notify]);

  useEffect(() => {
    if (status?.available !== true) return;

    let active = true;

    listMeals(1, debouncedSearch)
      .then((loaded) => {
        if (active) setData(loaded);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setData({ items: [], total: 0, page: 1, pageSize: 20 });
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити страви',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [status, debouncedSearch, reloadKey, notify]);

  if (status === undefined) {
    return (
      <>
        <PageHeader title="Харчування" description="Страви, з яких складаються плани." />
        <RowsSkeleton count={4} />
      </>
    );
  }

  if (!status.available) {
    return (
      <>
        <PageHeader title="Харчування" description="Страви, з яких складаються плани." />
        <NutritionUpsell status={status} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Харчування"
        description="Страви — іменовані набори продуктів, з яких складаються плани."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setForm({ open: true });
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Нова страва
          </Button>
        }
      />

      <NutritionTabs active="/dashboard/nutrition/meals" />

      <div className="mb-4 max-w-sm">
        <label className="sr-only" htmlFor="meal-search">
          Пошук страви
        </label>
        <Input
          id="meal-search"
          value={search}
          placeholder="Пошук страви…"
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>

      {data === undefined ? (
        <RowsSkeleton count={4} />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="Страв ще немає"
          description="Складіть першу страву з продуктів — далі з них будуються плани харчування."
          action={
            <Button
              variant="primary"
              onClick={() => {
                setForm({ open: true });
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Нова страва
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {data.items.map((meal) => (
            <li key={meal.id}>
              <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold tracking-[-0.02em] text-text">
                      {meal.name}
                    </h2>
                    <div className="mt-1">
                      <NutrientSummary nutrients={meal.nutrients} />
                    </div>
                    <ul className="mt-2 space-y-0.5 text-xs text-text-secondary">
                      {meal.items.map((item) => (
                        <li key={item.id}>
                          {item.foodName} — {item.grams} г
                          {item.portionLabel !== null &&
                            ` (${item.portionCount ?? ''} × ${item.portionLabel})`}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Редагувати ${meal.name}`}
                      onClick={() => {
                        setForm({ open: true, meal });
                      }}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Видалити ${meal.name}`}
                      onClick={() => {
                        setDeleting(meal);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {form.open && (
        <MealFormModal
          open
          meal={form.meal}
          onClose={() => {
            setForm({ open: false });
          }}
          onSaved={() => {
            setForm({ open: false });
            setReloadKey((key) => key + 1);
            notify('Збережено', 'success');
          }}
        />
      )}

      <Modal
        open={deleting !== undefined}
        onClose={() => {
          setDeleting(undefined);
        }}
        title="Видалити страву?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleting(undefined);
              }}
            >
              Скасувати
            </Button>
            <Button
              variant="danger"
              loading={removing}
              onClick={() => {
                const target = deleting;

                if (target === undefined) return;

                setRemoving(true);
                void deleteMeal(target.id)
                  .then(() => {
                    setDeleting(undefined);
                    setReloadKey((key) => key + 1);
                    notify('Страву видалено', 'success');
                  })
                  .catch((error: unknown) => {
                    notify(
                      error instanceof ApiError ? error.message : 'Не вдалося видалити',
                      'danger',
                    );
                  })
                  .finally(() => {
                    setRemoving(false);
                  });
              }}
            >
              Видалити
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-text-secondary">
          «{deleting?.name}» буде видалено. Плани, які вже надано клієнтам, не зміняться — вони
          зберігають власну копію.
        </p>
      </Modal>
    </>
  );
}
