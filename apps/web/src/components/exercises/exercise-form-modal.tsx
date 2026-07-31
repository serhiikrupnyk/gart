'use client';

import { type FormEvent, useState } from 'react';
import {
  MEDIA_KINDS,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUPS,
  type MediaKind,
  type MuscleGroup,
  type PublicCategory,
  type PublicExercise,
} from '@gart/shared';

import { Button, FormField, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import {
  createCategory,
  createExercise,
  deleteMedia,
  finalizeMedia,
  presignMedia,
  updateExercise,
} from '@/lib/exercises';
import { uploadToStorage } from '@/lib/upload';
import { MediaUploadField, validateMediaFile } from './media-upload-field';
import { MuscleGroupChips } from './muscle-group-chips';

const NEW_CATEGORY_VALUE = '__new__';

interface FormValues {
  name: string;
  description: string;
  primaryMuscleGroup: MuscleGroup;
  muscleGroups: MuscleGroup[];
  categoryId: string;
  textInstructions: string;
}

function initialValues(exercise: PublicExercise | undefined): FormValues {
  return {
    name: exercise?.name ?? '',
    description: exercise?.description ?? '',
    primaryMuscleGroup: exercise?.primaryMuscleGroup ?? 'LEGS',
    muscleGroups: exercise?.muscleGroups ?? [],
    categoryId: exercise?.categoryId ?? '',
    textInstructions: exercise?.textInstructions ?? '',
  };
}

export interface ExerciseFormModalProps {
  open: boolean;
  /** Present when editing; absent when creating. */
  exercise?: PublicExercise | undefined;
  categories: PublicCategory[];
  onClose: () => void;
  /** Fired after any successful save or media change, so the list refreshes. */
  onSaved: () => void;
  onCategoryCreated: (category: PublicCategory) => void;
}

/**
 * Create and edit in one form. Media files are staged locally and run through
 * the Step 8 flow on save — the exercise row must exist before presign can
 * bind a key to it. A media failure never loses the exercise: the row is saved
 * first, the error stays inline, and saving again retries only the media.
 */
export function ExerciseFormModal({
  open,
  exercise,
  categories,
  onClose,
  onSaved,
  onCategoryCreated,
}: ExerciseFormModalProps) {
  const { notify } = useToast();

  const [values, setValues] = useState<FormValues>(() => initialValues(exercise));
  const [seededFor, setSeededFor] = useState<string | undefined>(exercise?.id);
  // Once a create has saved, the form silently becomes an edit of that row —
  // so a media retry never creates a duplicate exercise.
  const [savedId, setSavedId] = useState<string | undefined>(exercise?.id);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [stagedFiles, setStagedFiles] = useState<Partial<Record<MediaKind, File>>>({});
  const [mediaErrors, setMediaErrors] = useState<Partial<Record<MediaKind, string>>>({});
  const [progress, setProgress] = useState<Partial<Record<MediaKind, number>>>({});
  const [newCategoryName, setNewCategoryName] = useState('');
  const [pending, setPending] = useState(false);
  const [removedKinds, setRemovedKinds] = useState<MediaKind[]>([]);

  // Re-seed local state when the modal is reused for a different exercise.
  const seedKey = exercise?.id ?? 'new';
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setSavedId(exercise?.id);
    setValues(initialValues(exercise));
    setFieldErrors({});
    setStagedFiles({});
    setMediaErrors({});
    setProgress({});
    setRemovedKinds([]);
    setNewCategoryName('');
  }

  function close(): void {
    setSeededFor(undefined);
    onClose();
  }

  function stageFile(kind: MediaKind, file: File | undefined): void {
    if (file !== undefined) {
      const error = validateMediaFile(kind, file);

      if (error !== undefined) {
        setMediaErrors((current) => ({ ...current, [kind]: error }));
        return;
      }
    }

    setMediaErrors((current) => ({ ...current, [kind]: undefined }));
    setStagedFiles((current) => ({ ...current, [kind]: file }));
  }

  async function handleRemoveExisting(kind: MediaKind): Promise<void> {
    if (savedId === undefined) return;

    try {
      await deleteMedia(savedId, kind);
      setRemovedKinds((current) => [...current, kind]);
      notify('Медіа прибрано', 'success');
      onSaved();
    } catch {
      notify('Не вдалося прибрати медіа', 'danger');
    }
  }

  async function handleCreateCategory(): Promise<void> {
    const name = newCategoryName.trim();

    if (name === '') {
      setFieldErrors((current) => ({ ...current, category: 'Введіть назву категорії' }));
      return;
    }

    try {
      const category = await createCategory(name);
      onCategoryCreated(category);
      setValues((current) => ({ ...current, categoryId: category.id }));
      setNewCategoryName('');
      setFieldErrors((current) => ({ ...current, category: '' }));
    } catch (error) {
      setFieldErrors((current) => ({
        ...current,
        category: error instanceof ApiError ? error.message : 'Не вдалося створити категорію',
      }));
    }
  }

  async function uploadStaged(exerciseId: string): Promise<boolean> {
    let allOk = true;

    for (const kind of MEDIA_KINDS) {
      const file = stagedFiles[kind];

      if (file === undefined) continue;

      try {
        // The Step 8 contract: presign with the file's own type and size,
        // PUT with exactly those (signed), then finalize to verify and record.
        const presigned = await presignMedia(exerciseId, kind, file);

        setProgress((current) => ({ ...current, [kind]: 0 }));
        await uploadToStorage(presigned.uploadUrl, file, (fraction) => {
          setProgress((current) => ({ ...current, [kind]: fraction }));
        });
        await finalizeMedia(exerciseId, kind, presigned.key);

        setStagedFiles((current) => ({ ...current, [kind]: undefined }));
      } catch (error) {
        allOk = false;
        setMediaErrors((current) => ({
          ...current,
          [kind]:
            error instanceof ApiError
              ? error.message
              : 'Не вдалося завантажити файл — спробуйте ще раз',
        }));
      } finally {
        setProgress((current) => ({ ...current, [kind]: undefined }));
      }
    }

    return allOk;
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();

    const errors: Record<string, string> = {};
    const name = values.name.trim();

    if (name === '') errors.name = 'Введіть назву вправи';
    if (name.length > 120) errors.name = 'Назва задовга';
    if (values.description.length > 2000) errors.description = 'Опис задовгий';
    if (values.textInstructions.length > 5000) errors.textInstructions = 'Інструкції задовгі';
    if (values.categoryId === NEW_CATEGORY_VALUE) {
      errors.category = 'Створіть категорію або оберіть наявну';
    }

    setFieldErrors(errors);
    if (Object.values(errors).some((message) => message !== '')) return;

    setPending(true);

    try {
      const payload = {
        name,
        description: values.description.trim() === '' ? null : values.description,
        primaryMuscleGroup: values.primaryMuscleGroup,
        muscleGroups: values.muscleGroups.filter((group) => group !== values.primaryMuscleGroup),
        categoryId: values.categoryId === '' ? null : values.categoryId,
        textInstructions: values.textInstructions.trim() === '' ? null : values.textInstructions,
      };

      const saved =
        savedId === undefined
          ? await createExercise(payload)
          : await updateExercise(savedId, payload);

      setSavedId(saved.id);

      const mediaOk = await uploadStaged(saved.id);

      onSaved();

      if (mediaOk) {
        notify(savedId === undefined ? 'Вправу створено' : 'Вправу збережено', 'success');
        close();
      } else {
        notify('Вправу збережено, але медіа не завантажено', 'danger');
      }
    } catch (error) {
      setFieldErrors((current) => ({
        ...current,
        form: error instanceof ApiError ? error.message : 'Не вдалося зберегти вправу',
      }));
    } finally {
      setPending(false);
    }
  }

  const existingMedia = (kind: MediaKind) =>
    removedKinds.includes(kind) ? undefined : exercise?.media.find((media) => media.kind === kind);

  return (
    <Modal
      open={open}
      onClose={close}
      title={exercise === undefined ? 'Нова вправа' : 'Редагувати вправу'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Скасувати
          </Button>
          <Button type="submit" form="exercise-form" variant="primary" loading={pending}>
            {pending ? 'Зберігаємо…' : 'Зберегти'}
          </Button>
        </>
      }
    >
      <form id="exercise-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField label="Назва" error={fieldErrors.name === '' ? undefined : fieldErrors.name}>
          {(props) => (
            <Input
              {...props}
              type="text"
              value={values.name}
              onChange={(event) => {
                setValues((current) => ({ ...current, name: event.target.value }));
              }}
              disabled={pending}
            />
          )}
        </FormField>

        <FormField
          label="Опис"
          error={fieldErrors.description === '' ? undefined : fieldErrors.description}
        >
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={values.description}
              onChange={(event) => {
                setValues((current) => ({ ...current, description: event.target.value }));
              }}
              disabled={pending}
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Основна група м'язів">
            {(props) => (
              <Select
                {...props}
                value={values.primaryMuscleGroup}
                onChange={(event) => {
                  setValues((current) => ({
                    ...current,
                    primaryMuscleGroup: event.target.value as MuscleGroup,
                  }));
                }}
                disabled={pending}
                options={MUSCLE_GROUPS.map((group) => ({
                  value: group,
                  label: MUSCLE_GROUP_LABELS[group],
                }))}
              />
            )}
          </FormField>

          <FormField
            label="Категорія"
            error={fieldErrors.category === '' ? undefined : fieldErrors.category}
          >
            {(props) => (
              <Select
                {...props}
                value={values.categoryId}
                onChange={(event) => {
                  setValues((current) => ({ ...current, categoryId: event.target.value }));
                }}
                disabled={pending}
                options={[
                  { value: '', label: 'Без категорії' },
                  ...categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                  { value: NEW_CATEGORY_VALUE, label: '+ Нова категорія…' },
                ]}
              />
            )}
          </FormField>
        </div>

        {values.categoryId === NEW_CATEGORY_VALUE && (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                type="text"
                value={newCategoryName}
                onChange={(event) => {
                  setNewCategoryName(event.target.value);
                }}
                placeholder="Назва категорії"
                aria-label="Назва нової категорії"
                disabled={pending}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => void handleCreateCategory()}
              disabled={pending}
            >
              Створити
            </Button>
          </div>
        )}

        <MuscleGroupChips
          legend="Додаткові групи м'язів"
          selected={values.muscleGroups}
          exclude={values.primaryMuscleGroup}
          onChange={(next) => {
            setValues((current) => ({ ...current, muscleGroups: next }));
          }}
          disabled={pending}
        />

        <FormField
          label="Інструкції"
          hint="Текстові вказівки, які бачитиме клієнт."
          error={fieldErrors.textInstructions === '' ? undefined : fieldErrors.textInstructions}
        >
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={values.textInstructions}
              onChange={(event) => {
                setValues((current) => ({ ...current, textInstructions: event.target.value }));
              }}
              disabled={pending}
            />
          )}
        </FormField>

        <div className="space-y-2">
          {MEDIA_KINDS.map((kind) => (
            <MediaUploadField
              key={kind}
              kind={kind}
              existing={existingMedia(kind)}
              staged={stagedFiles[kind]}
              onStage={(file) => {
                stageFile(kind, file);
              }}
              onRemoveExisting={
                savedId === undefined ? undefined : (removed) => void handleRemoveExisting(removed)
              }
              error={mediaErrors[kind] ?? undefined}
              progress={progress[kind]}
              disabled={pending}
            />
          ))}
        </div>

        {fieldErrors.form !== undefined && fieldErrors.form !== '' && (
          <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
            {fieldErrors.form}
          </p>
        )}
      </form>
    </Modal>
  );
}
