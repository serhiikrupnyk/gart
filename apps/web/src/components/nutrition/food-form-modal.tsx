'use client';

import { type FormEvent, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  FOOD_BRAND_MAX_LENGTH,
  FOOD_GROUP_LABELS,
  FOOD_GROUPS,
  FOOD_NAME_MAX_LENGTH,
  MAX_PORTIONS_PER_FOOD,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
  OPTIONAL_NUTRIENTS,
  PORTION_LABEL_MAX_LENGTH,
  REQUIRED_NUTRIENTS,
  type CreateFoodRequest,
  type FoodGroup,
  type OptionalNutrient,
  type PublicFood,
  type RequiredNutrient,
} from '@gart/shared';

import { Button, FormError, FormField, Input, Label, Modal, Select } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { createFood, updateFood } from '@/lib/nutrition';

type NutrientKey = RequiredNutrient | OptionalNutrient;

interface PortionDraft {
  label: string;
  grams: string;
}

const GROUP_OPTIONS = FOOD_GROUPS.map((group) => ({
  value: group,
  label: FOOD_GROUP_LABELS[group],
}));

function emptyNutrients(): Record<NutrientKey, string> {
  return {
    kcal: '',
    protein: '',
    fat: '',
    carbs: '',
    fibre: '',
    sugars: '',
    saturatedFat: '',
    salt: '',
  };
}

function fromFood(food: PublicFood): Record<NutrientKey, string> {
  return {
    kcal: food.nutrients.kcal,
    protein: food.nutrients.protein,
    fat: food.nutrients.fat,
    carbs: food.nutrients.carbs,
    fibre: food.nutrients.fibre ?? '',
    sugars: food.nutrients.sugars ?? '',
    saturatedFat: food.nutrients.saturatedFat ?? '',
    salt: food.nutrients.salt ?? '',
  };
}

/**
 * Create or edit one of the trainer's own foods.
 *
 * Values are typed and sent as STRINGS end to end — never parsed into a number
 * on the way — so what the trainer typed is what the Decimal column stores.
 * A comma is translated to a point rather than stripped: a Ukrainian keyboard
 * produces «12,5», and stripping the separator would silently store 125.
 */
export function FoodFormModal({
  open,
  food,
  onClose,
  onSaved,
}: {
  open: boolean;
  food?: PublicFood;
  onClose: () => void;
  onSaved: (saved: PublicFood) => void;
}) {
  const [name, setName] = useState(food?.name ?? '');
  const [brand, setBrand] = useState(food?.brand ?? '');
  const [group, setGroup] = useState<FoodGroup>(food?.group ?? 'OTHER');
  const [nutrients, setNutrients] = useState(
    food === undefined ? emptyNutrients() : fromFood(food),
  );
  const [portions, setPortions] = useState<PortionDraft[]>(
    food?.portions.map((portion) => ({ label: portion.label, grams: portion.grams })) ?? [],
  );
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  function setNutrient(key: NutrientKey, value: string): void {
    // «12,5» is what a Ukrainian keyboard gives. Translate the separator —
    // never strip it, which would turn 12,5 into 125.
    setNutrients((current) => ({ ...current, [key]: value.replace(/,/g, '.') }));
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setPending(true);

    const optional = (key: OptionalNutrient): string | null =>
      nutrients[key].trim() === '' ? null : nutrients[key].trim();

    const body: CreateFoodRequest = {
      name: name.trim(),
      brand: brand.trim() === '' ? null : brand.trim(),
      group,
      nutrients: {
        kcal: nutrients.kcal.trim(),
        protein: nutrients.protein.trim(),
        fat: nutrients.fat.trim(),
        carbs: nutrients.carbs.trim(),
        fibre: optional('fibre'),
        sugars: optional('sugars'),
        saturatedFat: optional('saturatedFat'),
        salt: optional('salt'),
      },
      portions: portions
        .filter((portion) => portion.label.trim() !== '' && portion.grams.trim() !== '')
        .map((portion) => ({
          label: portion.label.trim(),
          grams: portion.grams.trim().replace(/,/g, '.'),
        })),
    };

    try {
      onSaved(food === undefined ? await createFood(body) : await updateFood(food.id, body));
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Не вдалося зберегти продукт');
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={food === undefined ? 'Новий продукт' : 'Редагувати продукт'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Скасувати
          </Button>
          <Button variant="primary" type="submit" form="food-form" loading={pending}>
            Зберегти
          </Button>
        </>
      }
    >
      <form id="food-form" onSubmit={handleSubmit} noValidate className="mt-5 space-y-5">
        <FormField label="Назва">
          {(props) => (
            <Input
              {...props}
              value={name}
              maxLength={FOOD_NAME_MAX_LENGTH}
              onChange={(event) => {
                setName(event.target.value);
              }}
              disabled={pending}
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Бренд" hint="Необовʼязково.">
            {(props) => (
              <Input
                {...props}
                value={brand}
                maxLength={FOOD_BRAND_MAX_LENGTH}
                onChange={(event) => {
                  setBrand(event.target.value);
                }}
                disabled={pending}
              />
            )}
          </FormField>

          <div>
            <Label htmlFor="food-group">Група</Label>
            <div className="mt-1.5">
              <Select
                id="food-group"
                options={GROUP_OPTIONS}
                value={group}
                disabled={pending}
                onChange={(event) => {
                  setGroup(event.target.value as FoodGroup);
                }}
              />
            </div>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-bold text-text">На 100 г</legend>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            Усе перераховується від цих значень, тож порції нижче нічого не перевизначають.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {REQUIRED_NUTRIENTS.map((key) => (
              <FormField key={key} label={`${NUTRIENT_LABELS[key]}, ${NUTRIENT_UNITS[key]}`}>
                {(props) => (
                  <Input
                    {...props}
                    inputMode="decimal"
                    value={nutrients[key]}
                    onChange={(event) => {
                      setNutrient(key, event.target.value);
                    }}
                    disabled={pending}
                  />
                )}
              </FormField>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {OPTIONAL_NUTRIENTS.map((key) => (
              <FormField
                key={key}
                label={`${NUTRIENT_LABELS[key]}, ${NUTRIENT_UNITS[key]}`}
                hint="Порожньо — невідомо."
              >
                {(props) => (
                  <Input
                    {...props}
                    inputMode="decimal"
                    value={nutrients[key]}
                    onChange={(event) => {
                      setNutrient(key, event.target.value);
                    }}
                    disabled={pending}
                  />
                )}
              </FormField>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-bold text-text">Порції</legend>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            Звичні міри й скільки вони важать — «склянка», «столова ложка», «яйце середнє».
          </p>

          <div className="mt-3 space-y-2">
            {portions.map((portion, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <FormField label="Назва">
                    {(props) => (
                      <Input
                        {...props}
                        value={portion.label}
                        maxLength={PORTION_LABEL_MAX_LENGTH}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPortions((current) =>
                            current.map((item, at) =>
                              at === index ? { ...item, label: value } : item,
                            ),
                          );
                        }}
                        disabled={pending}
                      />
                    )}
                  </FormField>
                </div>
                <div className="w-28 shrink-0">
                  <FormField label="Грами">
                    {(props) => (
                      <Input
                        {...props}
                        inputMode="decimal"
                        value={portion.grams}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPortions((current) =>
                            current.map((item, at) =>
                              at === index ? { ...item, grams: value } : item,
                            ),
                          );
                        }}
                        disabled={pending}
                      />
                    )}
                  </FormField>
                </div>
                <Button
                  variant="ghost"
                  size="md"
                  aria-label={`Прибрати порцію ${portion.label}`}
                  disabled={pending}
                  onClick={() => {
                    setPortions((current) => current.filter((_, at) => at !== index));
                  }}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

          {portions.length < MAX_PORTIONS_PER_FOOD && (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => {
                setPortions((current) => [...current, { label: '', grams: '' }]);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Додати порцію
            </Button>
          )}
        </fieldset>

        {error !== undefined && <FormError>{error}</FormError>}
      </form>
    </Modal>
  );
}
