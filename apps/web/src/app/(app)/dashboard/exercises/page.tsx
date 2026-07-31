'use client';

import { useEffect, useState } from 'react';
import {
  MUSCLE_GROUP_LABELS,
  type ExercisePage,
  type PublicCategory,
  type PublicExercise,
} from '@gart/shared';

import { ExerciseDetailModal } from '@/components/exercises/exercise-detail-modal';
import {
  EMPTY_FILTERS,
  ExerciseFilters,
  type ExerciseFilterState,
} from '@/components/exercises/exercise-filters';
import { ExerciseFormModal } from '@/components/exercises/exercise-form-modal';
import { PageHeader } from '@/components/layout/page-header';
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import {
  deleteExercise,
  EXERCISES_PAGE_SIZE,
  listCategories,
  listExercises,
} from '@/lib/exercises';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type FormState = { open: false } | { open: true; exercise?: PublicExercise };

export default function ExercisesPage() {
  const { notify } = useToast();

  const [filters, setFilters] = useState<ExerciseFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ExercisePage | undefined>();
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const [detail, setDetail] = useState<PublicExercise | undefined>();
  const [form, setForm] = useState<FormState>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<PublicExercise | undefined>();
  const [deleting, setDeleting] = useState(false);

  const debouncedSearch = useDebouncedValue(filters.search, 300);

  useEffect(() => {
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
      .catch((error: unknown) => {
        if (!active) return;
        setData({ items: [], total: 0, page: 1, pageSize: EXERCISES_PAGE_SIZE });
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити вправи',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [page, debouncedSearch, filters.muscleGroup, filters.categoryId, reloadKey, notify]);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => {
        // The library still works without category names; filters degrade.
      });
  }, []);

  function applyFilters(next: ExerciseFilterState): void {
    setFilters(next);
    setPage(1);
  }

  function refresh(): void {
    setReloadKey((key) => key + 1);
  }

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === undefined) return;

    setDeleting(true);

    try {
      await deleteExercise(deleteTarget.id);
      notify('Вправу видалено', 'success');
      setDeleteTarget(undefined);
      setDetail(undefined);
      refresh();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Не вдалося видалити вправу', 'danger');
    } finally {
      setDeleting(false);
    }
  }

  const hasActiveFilters =
    filters.search !== '' || filters.muscleGroup !== '' || filters.categoryId !== '';
  const totalPages = data === undefined ? 1 : Math.max(1, Math.ceil(data.total / data.pageSize));
  const rangeStart =
    data === undefined || data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const rangeEnd = data === undefined ? 0 : Math.min(data.total, data.page * data.pageSize);

  return (
    <>
      <PageHeader
        title="Бібліотека вправ"
        description="Глобальна база та ваші власні вправи"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setForm({ open: true });
            }}
          >
            Додати вправу
          </Button>
        }
      />

      <div className="mb-4">
        <ExerciseFilters value={filters} onChange={applyFilters} categories={categories} />
      </div>

      {data === undefined ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Завантаження вправ" />
        </div>
      ) : data.total === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            title="Нічого не знайдено"
            description="Жодна вправа не відповідає фільтрам. Спробуйте змінити або скинути їх."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  applyFilters(EMPTY_FILTERS);
                }}
              >
                Скинути фільтри
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Бібліотека порожня"
            description="Додайте першу власну вправу — з відео, аудіо та інструкціями для клієнтів."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  setForm({ open: true });
                }}
              >
                Додати вправу
              </Button>
            }
          />
        )
      ) : (
        <>
          <Table caption="Бібліотека вправ">
            <Thead>
              <Tr>
                <Th>Вправа</Th>
                <Th>М&apos;язи</Th>
                <Th>Категорія</Th>
                <Th>Медіа</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.items.map((exercise) => (
                <Tr key={exercise.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDetail(exercise);
                        }}
                        className="truncate text-left font-medium text-text hover:underline"
                      >
                        {exercise.name}
                      </button>
                      {exercise.isCustom && <Badge tone="accent">Моя</Badge>}
                    </div>
                    {exercise.description !== null && (
                      <p className="mt-0.5 max-w-md truncate text-xs text-text-secondary">
                        {exercise.description}
                      </p>
                    )}
                  </Td>
                  <Td>
                    <span className="text-text-secondary">
                      {MUSCLE_GROUP_LABELS[exercise.primaryMuscleGroup]}
                      {exercise.muscleGroups.length > 0 && (
                        <span className="ml-1 text-text-muted" aria-hidden="true">
                          +{exercise.muscleGroups.length}
                        </span>
                      )}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-text-secondary">
                      {categories.find((category) => category.id === exercise.categoryId)?.name ??
                        '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-text-secondary">
                      {exercise.media.some((media) => media.kind === 'VIDEO') && (
                        <span title="Є відео">
                          ▶<span className="sr-only">є відео</span>
                        </span>
                      )}
                      {exercise.media.some((media) => media.kind === 'AUDIO') && (
                        <span className="ml-1" title="Є аудіо">
                          ♪<span className="sr-only">є аудіо</span>
                        </span>
                      )}
                    </span>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="tabular text-sm text-text-secondary">
              Показано {rangeStart}–{rangeEnd} з {data.total}
            </p>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage((current) => current - 1);
                  }}
                >
                  ← Назад
                </Button>
                <span className="tabular text-sm text-text-secondary">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => {
                    setPage((current) => current + 1);
                  }}
                >
                  Далі →
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <ExerciseDetailModal
        exercise={detail}
        categories={categories}
        onClose={() => {
          setDetail(undefined);
        }}
        onEdit={(exercise) => {
          setDetail(undefined);
          setForm({ open: true, exercise });
        }}
        onDelete={setDeleteTarget}
      />

      {form.open && (
        <ExerciseFormModal
          open
          exercise={form.exercise}
          categories={categories}
          onClose={() => {
            setForm({ open: false });
          }}
          onSaved={refresh}
          onCategoryCreated={(category) => {
            setCategories((current) => [...current, category]);
          }}
        />
      )}

      <Modal
        open={deleteTarget !== undefined}
        onClose={() => {
          setDeleteTarget(undefined);
        }}
        title="Видалити вправу?"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={deleting}
              onClick={() => {
                setDeleteTarget(undefined);
              }}
            >
              Скасувати
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void confirmDelete()}>
              {deleting ? 'Видаляємо…' : 'Видалити'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          «{deleteTarget?.name}» буде видалено назавжди разом із медіа. Цю дію не можна скасувати.
        </p>
      </Modal>
    </>
  );
}
