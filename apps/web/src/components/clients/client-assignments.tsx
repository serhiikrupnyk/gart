'use client';

import { useCallback, useEffect, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  ASSIGNMENT_STATUS_LABELS,
  DAY_OF_WEEK_LABELS,
  WORKOUT_TYPE_LABELS,
  type AssignmentStatus,
  type PublicAssignment,
} from '@gart/shared';

import {
  Badge,
  Button,
  DropdownItem,
  DropdownMenu,
  Modal,
  RowsSkeleton,
  type BadgeTone,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { deleteAssignment, listClientAssignments, updateAssignment } from '@/lib/assignments';
import { AssignProgramModal } from './assign-program-modal';

const STATUS_TONES: Record<AssignmentStatus, BadgeTone> = {
  ACTIVE: 'success',
  COMPLETED: 'neutral',
  ARCHIVED: 'neutral',
};

function formatDate(date: string): string {
  const [year, month, day] = date.split('-');

  return `${day ?? ''}.${month ?? ''}.${year ?? ''}`;
}

function scheduleLine(assignment: PublicAssignment): string {
  const days = assignment.daysOfWeek.map((day) => DAY_OF_WEEK_LABELS[day]).join('·');
  const range =
    assignment.endDate === null
      ? `з ${formatDate(assignment.startDate)}`
      : `${formatDate(assignment.startDate)} – ${formatDate(assignment.endDate)}`;

  return `${days} · ${range}`;
}

/** The «Програми клієнта» block on the client detail page. */
export function ClientAssignments({ clientId }: { clientId: string }) {
  const { notify } = useToast();

  const [assignments, setAssignments] = useState<PublicAssignment[] | undefined>();
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PublicAssignment | undefined>();
  const [deleting, setDeleting] = useState(false);

  const load = useCallback((): void => {
    listClientAssignments(clientId)
      .then(setAssignments)
      .catch(() => {
        setAssignments([]);
        notify('Не вдалося завантажити призначення', 'danger');
      });
  }, [clientId, notify]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(assignment: PublicAssignment, status: AssignmentStatus): Promise<void> {
    try {
      await updateAssignment(assignment.id, { status });
      notify(
        status === 'COMPLETED'
          ? 'Програму завершено'
          : status === 'ARCHIVED'
            ? 'Програму архівовано'
            : 'Програму активовано',
        'success',
      );
      load();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Не вдалося оновити статус', 'danger');
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === undefined) return;

    setDeleting(true);

    try {
      await deleteAssignment(deleteTarget.id);
      notify('Призначення видалено', 'success');
      setDeleteTarget(undefined);
      load();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Не вдалося видалити', 'danger');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Програми клієнта</h2>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setAssignOpen(true);
          }}
        >
          Призначити програму
        </Button>
      </div>

      <div className="mt-3">
        {assignments === undefined ? (
          <RowsSkeleton count={3} label="Завантаження призначень" />
        ) : assignments.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-strong bg-surface px-4 py-6 text-center text-sm text-text-secondary">
            Ще нічого не призначено.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {assignments.map((assignment) => (
              <li key={assignment.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">
                      {assignment.name}
                    </span>
                    <Badge tone="neutral">{WORKOUT_TYPE_LABELS[assignment.type]}</Badge>
                    <Badge tone={STATUS_TONES[assignment.status]}>
                      {ASSIGNMENT_STATUS_LABELS[assignment.status]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {scheduleLine(assignment)} · {assignment.exerciseCount} вправ
                  </p>
                </div>

                <DropdownMenu
                  triggerLabel={`Дії з призначенням «${assignment.name}»`}
                  trigger={<MoreHorizontal className="size-4" aria-hidden="true" />}
                >
                  {(close) => (
                    <>
                      {assignment.status !== 'ACTIVE' && (
                        <DropdownItem
                          onClick={() => {
                            close();
                            void setStatus(assignment, 'ACTIVE');
                          }}
                        >
                          Активувати
                        </DropdownItem>
                      )}
                      {assignment.status === 'ACTIVE' && (
                        <>
                          <DropdownItem
                            onClick={() => {
                              close();
                              void setStatus(assignment, 'COMPLETED');
                            }}
                          >
                            Завершити
                          </DropdownItem>
                          <DropdownItem
                            onClick={() => {
                              close();
                              void setStatus(assignment, 'ARCHIVED');
                            }}
                          >
                            Архівувати
                          </DropdownItem>
                        </>
                      )}
                      <DropdownItem
                        onClick={() => {
                          close();
                          setDeleteTarget(assignment);
                        }}
                      >
                        Видалити
                      </DropdownItem>
                    </>
                  )}
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AssignProgramModal
        open={assignOpen}
        clientId={clientId}
        onClose={() => {
          setAssignOpen(false);
        }}
        onAssigned={() => {
          load();
        }}
      />

      <Modal
        open={deleteTarget !== undefined}
        onClose={() => {
          setDeleteTarget(undefined);
        }}
        title="Видалити призначення?"
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
          «{deleteTarget?.name}» зникне з програм клієнта разом із його записами про виконання.
          Шаблон програми залишиться.
        </p>
      </Modal>
    </section>
  );
}
