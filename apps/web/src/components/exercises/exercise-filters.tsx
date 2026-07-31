'use client';

import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS, type PublicCategory } from '@gart/shared';

import { Button, Input, Select } from '@/components/ui';

export interface ExerciseFilterState {
  search: string;
  muscleGroup: string;
  categoryId: string;
}

export const EMPTY_FILTERS: ExerciseFilterState = { search: '', muscleGroup: '', categoryId: '' };

export interface ExerciseFiltersProps {
  value: ExerciseFilterState;
  onChange: (next: ExerciseFilterState) => void;
  categories: PublicCategory[];
}

/** The toolbar above the list. Any change is a new filter state; paging resets upstream. */
export function ExerciseFilters({ value, onChange, categories }: ExerciseFiltersProps) {
  const hasActiveFilter =
    value.search !== '' || value.muscleGroup !== '' || value.categoryId !== '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1 basis-56">
        <Input
          type="text"
          value={value.search}
          onChange={(event) => {
            onChange({ ...value, search: event.target.value });
          }}
          placeholder="Пошук вправи…"
          aria-label="Пошук вправи"
        />
      </div>

      <div className="w-44">
        <Select
          aria-label="Група м'язів"
          value={value.muscleGroup}
          onChange={(event) => {
            onChange({ ...value, muscleGroup: event.target.value });
          }}
          options={[
            { value: '', label: "Всі групи м'язів" },
            ...MUSCLE_GROUPS.map((group) => ({ value: group, label: MUSCLE_GROUP_LABELS[group] })),
          ]}
        />
      </div>

      <div className="w-44">
        <Select
          aria-label="Категорія"
          value={value.categoryId}
          onChange={(event) => {
            onChange({ ...value, categoryId: event.target.value });
          }}
          options={[
            { value: '', label: 'Всі категорії' },
            ...categories.map((category) => ({ value: category.id, label: category.name })),
          ]}
        />
      </div>

      {hasActiveFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(EMPTY_FILTERS);
          }}
        >
          Скинути
        </Button>
      )}
    </div>
  );
}
