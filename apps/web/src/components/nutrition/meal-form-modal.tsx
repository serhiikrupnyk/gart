'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  MAX_ITEMS_PER_MEAL,
  MEAL_NAME_MAX_LENGTH,
  multiplyNutrients,
  scaleNutrients,
  sumNutrients,
  zeroNutrients,
  type CreateMealRequest,
  type Nutrients,
  type PublicFood,
  type PublicMeal,
} from '@gart/shared';

import { NutrientSummary } from '@/components/nutrition/nutrient-summary';
import { PICKER_PAGE_SIZE, withSelected } from '@/components/nutrition/picker';
import {
  Button,
  FormError,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { createMeal, updateMeal } from '@/lib/meals';
import { listFoods } from '@/lib/nutrition';
import { useDebouncedValue } from '@/lib/use-debounced-value';

interface ItemDraft {
  foodId: string;
  grams: string;
  portionLabel: string | null;
  portionCount: string | null;
}

/**
 * Compose a meal from foods.
 *
 * Totals update as the trainer types, computed by the SAME shared helpers the
 * server uses — so the preview and the saved figure cannot disagree. Amounts
 * are strings end to end, and a decimal comma is translated rather than
 * stripped: «12,5» from a Ukrainian keyboard must not become 125.
 */
export function MealFormModal({
  open,
  meal,
  onClose,
  onSaved,
}: {
  open: boolean;
  meal?: PublicMeal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(meal?.name ?? '');
  const [notes, setNotes] = useState(meal?.notes ?? '');
  const [items, setItems] = useState<ItemDraft[]>(
    meal?.items.map((item) => ({
      foodId: item.foodId,
      grams: item.grams,
      portionLabel: item.portionLabel,
      portionCount: item.portionCount,
    })) ?? [],
  );
  const [foods, setFoods] = useState<PublicFood[]>();
  const [foodSearch, setFoodSearch] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const { notify } = useToast();
  const debouncedFoodSearch = useDebouncedValue(foodSearch, 300);

  useEffect(() => {
    let active = true;

    listFoods({ page: 1, pageSize: PICKER_PAGE_SIZE, search: debouncedFoodSearch })
      .then((page) => {
        if (active) setFoods(page.items);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setFoods([]);
        // An empty library and a failed request must not look the same: one
        // means «add a food first», the other means «try again».
        notify(
          caught instanceof ApiError ? caught.message : 'Не вдалося завантажити продукти',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [debouncedFoodSearch, notify]);

  const loaded = foods ?? [];

  /** The portions a food offers, plus «у грамах» for writing a weight directly. */
  function portionOptions(foodId: string): { value: string; label: string }[] {
    const food = loaded.find((candidate) => candidate.id === foodId);

    return [
      { value: '', label: 'у грамах' },
      ...(food?.portions ?? []).map((portion) => ({
        value: portion.label,
        label: `${portion.label} (${portion.grams} г)`,
      })),
    ];
  }

  /**
   * What `count` of a food's named portion weighs.
   *
   * Computed here and STORED as grams, because grams are what every total is
   * derived from. The label and count ride along only to record how the trainer
   * wrote it — which is why renaming the portion later cannot restate the meal.
   */
  function gramsFor(item: ItemDraft, count: string): string {
    const food = loaded.find((candidate) => candidate.id === item.foodId);
    const portion = food?.portions.find((candidate) => candidate.label === item.portionLabel);

    if (portion === undefined) {
      return item.grams;
    }

    return (
      multiplyNutrients({ ...zeroNutrients(), kcal: portion.grams }, count === '' ? '0' : count)
        ?.kcal ?? item.grams
    );
  }
  // Every selected row can name itself even when it is outside the current
  // search results — the names travel with the meal being edited.
  const options = withSelected(
    loaded.map((food) => ({ value: food.id, label: food.name })),
    (meal?.items ?? []).map((item) => ({ value: item.foodId, label: item.foodName })),
  );

  /** The running total, from the same helpers the server totals with. */
  /**
   * The running total, or null when it cannot honestly be shown.
   *
   * `null` for ANY line that will not resolve — a food outside the currently
   * loaded set, or a grams field mid-edit. Dropping those silently produced a
   * box labelled «Разом» holding the total of a subset, which is worse than
   * showing nothing.
   */
  const preview: Nutrients | null = (() => {
    if (items.length === 0) {
      return null;
    }

    const lines: Nutrients[] = [];

    for (const item of items) {
      const food = loaded.find((candidate) => candidate.id === item.foodId);
      const line = food === undefined ? null : scaleNutrients(food.nutrients, item.grams);

      if (line === null) {
        return null;
      }

      lines.push(line);
    }

    return sumNutrients(lines);
  })();

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setPending(true);

    const body: CreateMealRequest = {
      name: name.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
      items: items.map((item) => ({
        foodId: item.foodId,
        grams: item.grams.trim().replace(/,/g, '.'),
        portionLabel: item.portionLabel,
        // A label without a count renders as «( × ложка)», so the two travel
        // together or not at all.
        portionCount: item.portionLabel === null ? null : (item.portionCount ?? '1'),
      })),
    };

    try {
      if (meal === undefined) {
        await createMeal(body);
      } else {
        await updateMeal(meal.id, body);
      }
      onSaved();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Не вдалося зберегти страву');
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={meal === undefined ? 'Нова страва' : 'Редагувати страву'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Скасувати
          </Button>
          <Button variant="primary" type="submit" form="meal-form" loading={pending}>
            Зберегти
          </Button>
        </>
      }
    >
      <form id="meal-form" onSubmit={handleSubmit} noValidate className="mt-5 space-y-5">
        <FormField label="Назва">
          {(props) => (
            <Input
              {...props}
              value={name}
              maxLength={MEAL_NAME_MAX_LENGTH}
              onChange={(event) => {
                setName(event.target.value);
              }}
              disabled={pending}
            />
          )}
        </FormField>

        <fieldset>
          <legend className="text-sm font-bold text-text">Продукти</legend>

          <div className="mt-2">
            <label className="sr-only" htmlFor="meal-food-search">
              Пошук у базі продуктів
            </label>
            <Input
              id="meal-food-search"
              value={foodSearch}
              placeholder="Пошук у базі — гречка, курка, яйце…"
              disabled={pending}
              onChange={(event) => {
                setFoodSearch(event.target.value);
              }}
            />
          </div>

          <div className="mt-3 space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`meal-food-${String(index)}`}>
                    Продукт
                  </label>
                  <Select
                    id={`meal-food-${String(index)}`}
                    options={options}
                    value={item.foodId}
                    disabled={pending}
                    onChange={(event) => {
                      const value = event.target.value;
                      setItems((current) =>
                        current.map((row, at) => (at === index ? { ...row, foodId: value } : row)),
                      );
                    }}
                  />
                </div>
                <div className="w-20 shrink-0">
                  <label className="sr-only" htmlFor={`meal-count-${String(index)}`}>
                    Кількість порцій
                  </label>
                  <Input
                    id={`meal-count-${String(index)}`}
                    inputMode="decimal"
                    placeholder="1"
                    value={item.portionCount ?? ''}
                    disabled={pending || item.portionLabel === null}
                    onChange={(event) => {
                      const count = event.target.value.replace(/,/g, '.');
                      setItems((current) =>
                        current.map((row, at) =>
                          at === index
                            ? { ...row, portionCount: count, grams: gramsFor(row, count) }
                            : row,
                        ),
                      );
                    }}
                  />
                </div>
                <div className="w-36 shrink-0">
                  <label className="sr-only" htmlFor={`meal-portion-${String(index)}`}>
                    Порція
                  </label>
                  <Select
                    id={`meal-portion-${String(index)}`}
                    options={portionOptions(item.foodId)}
                    value={item.portionLabel ?? ''}
                    disabled={pending}
                    onChange={(event) => {
                      const label = event.target.value === '' ? null : event.target.value;
                      setItems((current) =>
                        current.map((row, at) => {
                          if (at !== index) return row;

                          // Choosing a portion COMPUTES the grams; choosing
                          // «у грамах» leaves whatever weight is already there
                          // and simply stops describing it as portions.
                          const next = {
                            ...row,
                            portionLabel: label,
                            portionCount: label === null ? null : (row.portionCount ?? '1'),
                          };

                          return label === null
                            ? next
                            : { ...next, grams: gramsFor(next, next.portionCount ?? '1') };
                        }),
                      );
                    }}
                  />
                </div>
                <div className="w-24 shrink-0">
                  <label className="sr-only" htmlFor={`meal-grams-${String(index)}`}>
                    Грами
                  </label>
                  <Input
                    id={`meal-grams-${String(index)}`}
                    inputMode="decimal"
                    value={item.grams}
                    // Grams are canonical, so they stay readable — but while a
                    // portion describes the amount they are derived, and typing
                    // into both would make the two disagree.
                    readOnly={item.portionLabel !== null}
                    disabled={pending}
                    onChange={(event) => {
                      const value = event.target.value.replace(/,/g, '.');
                      setItems((current) =>
                        current.map((row, at) => (at === index ? { ...row, grams: value } : row)),
                      );
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  aria-label="Прибрати продукт"
                  disabled={pending}
                  onClick={() => {
                    setItems((current) => current.filter((_, at) => at !== index));
                  }}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

          {foods !== undefined && loaded.length === 0 && (
            // Never an empty fieldset with a Save button whose only outcome is
            // a 400: say what to do instead.
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              {foodSearch === ''
                ? 'У базі ще немає продуктів — додайте перший на вкладці «Продукти».'
                : 'За цим запитом нічого не знайдено.'}
            </p>
          )}

          {items.length < MAX_ITEMS_PER_MEAL && loaded.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => {
                setItems((current) => [
                  ...current,
                  {
                    foodId: loaded[0]?.id ?? '',
                    grams: '100',
                    portionLabel: null,
                    portionCount: null,
                  },
                ]);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Додати продукт
            </Button>
          )}
        </fieldset>

        {preview !== null && (
          <div className="rounded-control border border-border bg-bg-subtle p-3">
            <p className="text-2xs font-bold uppercase tracking-[0.12em] text-text-muted">Разом</p>
            <div className="mt-1">
              <NutrientSummary nutrients={preview} />
            </div>
          </div>
        )}

        <FormField label="Нотатка" hint="Необовʼязково.">
          {(props) => (
            <Textarea
              {...props}
              value={notes}
              rows={2}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
              disabled={pending}
            />
          )}
        </FormField>

        {error !== undefined && <FormError>{error}</FormError>}
      </form>
    </Modal>
  );
}
