'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  WORKOUT_TYPE_LABELS,
  WORKOUT_TYPES,
  type PublicExercise,
  type PublicProgramDetail,
  type WorkoutType,
} from '@gart/shared';

import { Button, FormField, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import {
  draftFromDetail,
  emptyDraft,
  moveItem,
  newSection,
  nextUid,
  reorderByUid,
  toSectionInputs,
  type DraftSection,
  type ProgramDraft,
} from '@/lib/program-draft';
import { validateProgramDraft } from '@/lib/program-rules';
import { createProgram, updateProgram } from '@/lib/programs';
import { ExercisePickerModal } from './exercise-picker-modal';
import { SectionCard, type SectionDragState } from './section-card';

function fingerprint(draft: ProgramDraft): string {
  return JSON.stringify({
    name: draft.name.trim(),
    description: draft.description.trim(),
    type: draft.type,
    sections: toSectionInputs(draft.sections),
  });
}

/**
 * The document editor for a program template. All edits are local; saving
 * sends the whole tree (Step 10's full-replace contract), so drag-reorder is
 * nothing but reordering the local array.
 *
 * Unsaved-changes coverage, honestly stated: `beforeunload` guards tab close
 * and refresh; the builder's own exits confirm through a modal. App Router
 * offers no supported way to block sidebar navigation — that path stays
 * unguarded rather than monkey-patched.
 */
export function ProgramBuilder({ initial }: { initial?: PublicProgramDetail }) {
  const router = useRouter();
  const { notify } = useToast();

  const [draft, setDraft] = useState<ProgramDraft>(() =>
    initial === undefined ? emptyDraft() : draftFromDetail(initial),
  );
  const [savedFingerprint, setSavedFingerprint] = useState(() => fingerprint(draft));
  const [programId, setProgramId] = useState<string | undefined>(initial?.id);

  const [nameError, setNameError] = useState<string | undefined>();
  const [sectionErrors, setSectionErrors] = useState<Map<string, string>>(new Map());
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const [pickerFor, setPickerFor] = useState<string | undefined>();
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const [drag, setDrag] = useState<SectionDragState | undefined>();
  const [dropTarget, setDropTarget] = useState<string | undefined>();

  const dirty = useMemo(() => fingerprint(draft) !== savedFingerprint, [draft, savedFingerprint]);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  function updateSection(uid: string, next: DraftSection): void {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) => (section.uid === uid ? next : section)),
    }));
  }

  function moveSection(index: number, direction: -1 | 1): void {
    setDraft((current) => ({
      ...current,
      sections: moveItem(current.sections, index, direction),
    }));
    announce(direction === -1 ? 'Секцію переміщено вгору' : 'Секцію переміщено вниз');
  }

  function handleSectionDrop(): void {
    if (drag?.kind !== 'section' || dropTarget === undefined) return;

    setDraft((current) => ({
      ...current,
      sections: reorderByUid(current.sections, drag.uid, dropTarget),
    }));
    announce('Порядок секцій змінено');
    setDrag(undefined);
    setDropTarget(undefined);
  }

  function addExercise(exercise: PublicExercise): void {
    if (pickerFor === undefined) return;

    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.uid === pickerFor
          ? {
              ...section,
              exercises: [
                ...section.exercises,
                {
                  uid: nextUid(),
                  exerciseId: exercise.id,
                  exerciseName: exercise.name,
                  primaryMuscleGroup: exercise.primaryMuscleGroup,
                  sets: null,
                  reps: null,
                  loadValue: null,
                  loadUnit: null,
                  loadText: null,
                  restSeconds: null,
                  tempo: null,
                  notes: null,
                  durationSeconds: null,
                  distanceMeters: null,
                },
              ],
            }
          : section,
      ),
    }));
  }

  async function save(): Promise<void> {
    const validation = validateProgramDraft(draft);

    setNameError(validation.nameError);
    setSectionErrors(validation.sectionErrors);
    setFormError(undefined);

    if (validation.nameError !== undefined || validation.sectionErrors.size > 0) return;

    setSaving(true);

    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() === '' ? null : draft.description.trim(),
        type: draft.type,
        sections: toSectionInputs(draft.sections),
      };

      const saved =
        programId === undefined
          ? await createProgram(payload)
          : await updateProgram(programId, payload);

      setSavedFingerprint(fingerprint(draft));
      notify(programId === undefined ? 'Програму створено' : 'Програму збережено', 'success');

      if (programId === undefined) {
        setProgramId(saved.id);
        router.replace(`/dashboard/programs/${saved.id}`);
      }
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Не вдалося зберегти програму');
    } finally {
      setSaving(false);
    }
  }

  function leave(): void {
    if (dirty) {
      setLeaveConfirmOpen(true);
    } else {
      router.push('/dashboard/programs');
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
        <button
          type="button"
          onClick={leave}
          className="text-sm text-text-secondary underline underline-offset-4 hover:text-text"
        >
          <ArrowLeft className="inline size-4 align-[-3px]" aria-hidden="true" /> До програм
        </button>

        <div className="flex items-center gap-3">
          {dirty && <span className="text-sm text-text-secondary">незбережені зміни</span>}
          <Button variant="secondary" onClick={leave} disabled={saving}>
            Скасувати
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {saving ? 'Зберігаємо…' : 'Зберегти'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <FormField label="Назва програми" error={nameError}>
            {(props) => (
              <Input
                {...props}
                type="text"
                value={draft.name}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, name: event.target.value }));
                }}
                disabled={saving}
              />
            )}
          </FormField>

          <FormField label="Тип програми">
            {(props) => (
              <Select
                {...props}
                value={draft.type}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    type: event.target.value as WorkoutType,
                  }));
                }}
                disabled={saving}
                options={WORKOUT_TYPES.map((type) => ({
                  value: type,
                  label: WORKOUT_TYPE_LABELS[type],
                }))}
              />
            )}
          </FormField>
        </div>

        <FormField label="Опис">
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={draft.description}
              onChange={(event) => {
                setDraft((current) => ({ ...current, description: event.target.value }));
              }}
              disabled={saving}
            />
          )}
        </FormField>

        {formError !== undefined && (
          <p
            role="alert"
            className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger-text"
          >
            {formError}
          </p>
        )}

        <ul className="space-y-3">
          {draft.sections.map((section, index) => (
            <SectionCard
              key={section.uid}
              section={section}
              index={index}
              count={draft.sections.length}
              error={sectionErrors.get(section.uid)}
              onChange={(next) => {
                updateSection(section.uid, next);
              }}
              onMove={(direction) => {
                moveSection(index, direction);
              }}
              onRemove={() => {
                setDraft((current) => ({
                  ...current,
                  sections: current.sections.filter((entry) => entry.uid !== section.uid),
                }));
              }}
              onAddExercise={() => {
                setPickerFor(section.uid);
              }}
              announce={announce}
              drag={drag}
              setDrag={setDrag}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              onSectionDrop={handleSectionDrop}
            />
          ))}
        </ul>

        <Button
          variant="secondary"
          onClick={() => {
            setDraft((current) => ({
              ...current,
              sections: [...current.sections, newSection(current.type)],
            }));
          }}
        >
          + Додати секцію
        </Button>
      </div>

      {/* Reorder feedback for screen readers; visually silent. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ExercisePickerModal
        open={pickerFor !== undefined}
        onClose={() => {
          setPickerFor(undefined);
        }}
        onAdd={addExercise}
      />

      <Modal
        open={leaveConfirmOpen}
        onClose={() => {
          setLeaveConfirmOpen(false);
        }}
        title="Незбережені зміни"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setLeaveConfirmOpen(false);
              }}
            >
              Залишитись
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                router.push('/dashboard/programs');
              }}
            >
              Вийти без збереження
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Зміни в програмі не збережено. Якщо вийти зараз, їх буде втрачено.
        </p>
      </Modal>
    </>
  );
}
