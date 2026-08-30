'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  FOOD_GROUP_LABELS,
  FOOD_GROUPS,
  FOODS_PAGE_SIZE,
  NUTRIENT_UNITS,
  scaleNutrients,
  type FoodGroup,
  type FoodPage,
  type NutritionStatus,
  type PublicFood,
} from '@gart/shared';

import { FoodFormModal } from '@/components/nutrition/food-form-modal';
import { NutritionTabs } from '@/components/nutrition/nutrition-tabs';
import { NutritionUpsell } from '@/components/nutrition/nutrition-upsell';
import { PageHeader } from '@/components/layout/page-header';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  RowsSkeleton,
  Select,
  Table,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { deleteFood, getNutritionStatus, listFoods } from '@/lib/nutrition';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const ALL = 'ALL';

const GROUP_OPTIONS = [
  { value: ALL, label: 'Усі групи' },
  ...FOOD_GROUPS.map((group) => ({ value: group, label: FOOD_GROUP_LABELS[group] })),
];

const OWNER_OPTIONS = [
  { value: 'ALL', label: 'Уся база' },
  { value: 'MINE', label: 'Тільки мої' },
];

type FormState = { open: false } | { open: true; food?: PublicFood };

/**
 * The food library.
 *
 * One route for both plans: the status call answers on any plan, and a PRO
 * trainer lands on the upsell rather than on a dead nav item or a 402 they have
 * to interpret. Nothing here is hidden — nutrition exists, and they are told
 * plainly what it costs.
 */
export default function NutritionPage() {
  const { notify } = useToast();

  const [status, setStatus] = useState<NutritionStatus>();
  const [data, setData] = useState<FoodPage>();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<string>(ALL);
  const [owner, setOwner] = useState('ALL');
  const [form, setForm] = useState<FormState>({ open: false });
  const [deleting, setDeleting] = useState<PublicFood>();
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
        // Without a fallback the skeleton stays up for ever: the toast goes
        // away and nothing else ever sets `status`. Failing closed to the
        // upsell is the honest guess — it offers a way forward instead of a
        // spinner, and the API refuses anyway if the plan does not allow it.
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
    if (status?.available !== true) {
      return;
    }

    let active = true;

    listFoods({
      page,
      search: debouncedSearch,
      group: group === ALL ? undefined : (group as FoodGroup),
      mineOnly: owner === 'MINE',
    })
      .then((loaded) => {
        if (active) setData(loaded);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setData({ items: [], total: 0, page: 1, pageSize: FOODS_PAGE_SIZE });
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити продукти',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [status, page, debouncedSearch, group, owner, reloadKey, notify]);

  if (status === undefined) {
    return (
      <>
        <PageHeader title="Харчування" description="База продуктів для планів харчування." />
        <RowsSkeleton count={4} />
      </>
    );
  }

  if (!status.available) {
    return (
      <>
        <PageHeader title="Харчування" description="База продуктів для планів харчування." />
        <NutritionUpsell status={status} />
      </>
    );
  }

  const lastPage = data === undefined ? 1 : Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <>
      <PageHeader
        title="Харчування"
        description="Спільна база продуктів і ваші власні. Усі значення — на 100 г."
        meta={
          data === undefined ? undefined : (
            <Badge tone="neutral">{String(data.total)} продуктів</Badge>
          )
        }
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setForm({ open: true });
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Додати продукт
          </Button>
        }
      />

      <NutritionTabs active="/dashboard/nutrition" />

      <Card padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor="food-search">
              Пошук продукту
            </label>
            <Input
              id="food-search"
              value={search}
              placeholder="Пошук — гречка, сир, яйце…"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full sm:w-52">
            <label className="sr-only" htmlFor="food-group-filter">
              Група продуктів
            </label>
            <Select
              id="food-group-filter"
              options={GROUP_OPTIONS}
              value={group}
              onChange={(event) => {
                setGroup(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full sm:w-40">
            <label className="sr-only" htmlFor="food-owner-filter">
              Чиї продукти
            </label>
            <Select
              id="food-owner-filter"
              options={OWNER_OPTIONS}
              value={owner}
              onChange={(event) => {
                setOwner(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </Card>

      <div className="mt-4">
        {data === undefined ? (
          <TableSkeleton rows={8} columns={5} label="Завантаження продуктів" />
        ) : data.items.length === 0 ? (
          <EmptyState
            title="Нічого не знайдено"
            description="Спробуйте інший запит або додайте власний продукт."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  setForm({ open: true });
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                Додати продукт
              </Button>
            }
          />
        ) : (
          <Table caption="Продукти, значення на 100 г">
            <Thead>
              <Tr>
                <Th>Продукт</Th>
                <Th>Група</Th>
                <Th>Ккал</Th>
                <Th>Б / Ж / В</Th>
                <Th>Порції</Th>
                <Th>{''}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.items.map((food) => (
                <FoodRow
                  key={food.id}
                  food={food}
                  onEdit={() => {
                    setForm({ open: true, food });
                  }}
                  onDelete={() => {
                    setDeleting(food);
                  }}
                />
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      {data !== undefined && data.total > data.pageSize && (
        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              setPage((current) => current - 1);
            }}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Назад
          </Button>
          <p className="text-sm text-text-secondary">
            Сторінка {String(page)} із {String(lastPage)}
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => {
              setPage((current) => current + 1);
            }}
          >
            Далі
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {form.open && (
        <FoodFormModal
          open
          food={form.food}
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
        title="Видалити продукт?"
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

                // Guarded: a second click would send a second DELETE, which
                // 404s and surfaces Nest's English «Not Found» in a Ukrainian
                // toast.
                setRemoving(true);
                void deleteFood(target.id)
                  .then(() => {
                    setDeleting(undefined);
                    setReloadKey((key) => key + 1);
                    notify('Продукт видалено', 'success');
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
          «{deleting?.name}» буде видалено разом із його порціями. Це не можна скасувати.
        </p>
      </Modal>
    </>
  );
}

/** One row, with the per-portion figures worked out from the per-100 g values. */
function FoodRow({
  food,
  onEdit,
  onDelete,
}: {
  food: PublicFood;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { nutrients } = food;

  return (
    <Tr>
      <Td>
        <span className="font-semibold text-text">{food.name}</span>
        {food.brand !== null && (
          <span className="ml-1.5 text-xs text-text-secondary">{food.brand}</span>
        )}
        {!food.editable && (
          <span className="ml-2 align-middle">
            <Badge tone="neutral">Спільна база</Badge>
          </span>
        )}
      </Td>
      <Td>
        <span className="text-text-secondary">{FOOD_GROUP_LABELS[food.group]}</span>
      </Td>
      <Td>
        <span className="tabular-nums font-semibold text-text">{nutrients.kcal}</span>
      </Td>
      <Td>
        <span className="tabular-nums text-text-secondary">
          {nutrients.protein} / {nutrients.fat} / {nutrients.carbs}
        </span>
      </Td>
      <Td>
        {food.portions.length === 0 ? (
          <span className="text-text-muted">—</span>
        ) : (
          <ul className="space-y-0.5">
            {food.portions.map((portion) => {
              const scaled = scaleNutrients(nutrients, portion.grams);

              return (
                <li key={portion.id} className="text-xs text-text-secondary">
                  {portion.label} · {portion.grams} г
                  {scaled !== null && (
                    <span className="tabular-nums">
                      {' '}
                      — {scaled.kcal} {NUTRIENT_UNITS.kcal}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Td>
      <Td>
        {food.editable ? (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Редагувати ${food.name}`}
              onClick={onEdit}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Видалити ${food.name}`}
              onClick={onDelete}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </Td>
    </Tr>
  );
}
