'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  MUSCLE_GROUP_LABELS,
  type ExercisePage,
  type PublicCategory,
  type PublicExercise,
} from '@gart/shared';

import {
  EMPTY_FILTERS,
  ExerciseFilters,
  type ExerciseFilterState,
} from '@/components/exercises/exercise-filters';
import { Badge, Button, Modal, RowsSkeleton } from '@/components/ui';
import { listCategories, listExercises } from '@/lib/exercises';
import { useDebouncedValue } from '@/lib/use-debounced-value';

export interface ExercisePickerModalProps {
  open: boolean;
  onClose: () => void;
  /** Called per chosen exercise; the picker stays open for multi-add. */
  onAdd: (exercise: PublicExercise) => void;
}

/**
 * The Step 9 composition reused verbatim: the library's own filters and paged
 * listing, inside a modal over the builder — so the trainer browses the whole
 * library without losing a keystroke of builder state.
 */
export function ExercisePickerModal({ open, onClose, onAdd }: ExercisePickerModalProps) {
  const [filters, setFilters] = useState<ExerciseFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ExercisePage | undefined>();
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const debouncedSearch = useDebouncedValue(filters.search, 300);

  useEffect(() => {
    if (!open) return;

    listCategories()
      .then(setCategories)
      .catch(() => {
        // The picker still works without category names.
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let active = true;

    listExercises({
      page,
      search: debouncedSearch,
      muscleGroup: filters.muscleGroup,
      categoryId: filters.categoryId,
    })
      .then((loaded) => {
        if (active) setData(loaded);
      })
      .catch(() => {
        if (active) setData({ items: [], total: 0, page: 1, pageSize: 20 });
      });

    return () => {
      active = false;
    };
  }, [open, page, debouncedSearch, filters.muscleGroup, filters.categoryId]);

  function handleAdd(exercise: PublicExercise): void {
    onAdd(exercise);
    setAddedIds((current) => new Set(current).add(exercise.id));
  }

  function close(): void {
    setAddedIds(new Set());
    setFilters(EMPTY_FILTERS);
    setPage(1);
    onClose();
  }

  const totalPages = data === undefined ? 1 : Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <Modal
      open={open}
      onClose={close}
      title="Додати вправу"
      size="lg"
      footer={
        <Button variant="primary" onClick={close}>
          Готово
        </Button>
      }
    >
      <div className="space-y-3">
        <ExerciseFilters
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          categories={categories}
        />

        {data === undefined ? (
          <RowsSkeleton count={5} label="Завантаження вправ" />
        ) : data.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-secondary">Нічого не знайдено</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
            {data.items.map((exercise) => (
              <li key={exercise.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">{exercise.name}</span>
                    {exercise.isCustom && <Badge tone="accent">Моя</Badge>}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {MUSCLE_GROUP_LABELS[exercise.primaryMuscleGroup]}
                  </span>
                </span>

                <Button variant="secondary" size="sm" onClick={() => handleAdd(exercise)}>
                  {addedIds.has(exercise.id) && <Check className="size-4" aria-hidden="true" />}
                  {addedIds.has(exercise.id) ? 'Додано' : 'Додати'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {data !== undefined && totalPages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setPage((current) => current - 1);
              }}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Назад
            </Button>
            <span className="tabular text-sm text-text-secondary">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => {
                setPage((current) => current + 1);
              }}
            >
              Далі
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
