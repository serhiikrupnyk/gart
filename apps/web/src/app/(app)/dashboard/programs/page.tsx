'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { WORKOUT_TYPE_LABELS, type ProgramPage, type PublicProgram } from '@gart/shared';

import { PageHeader } from '@/components/layout/page-header';
import { WorkoutTabs } from '@/components/layout/workout-tabs';
import {
  Badge,
  Button,
  DropdownItem,
  DropdownMenu,
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
import { deleteProgram, listPrograms, PROGRAMS_PAGE_SIZE } from '@/lib/programs';

export default function ProgramsPage() {
  const { notify } = useToast();

  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProgramPage | undefined>();
  const [reloadKey, setReloadKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<PublicProgram | undefined>();
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;

    listPrograms(page)
      .then((loaded) => {
        if (active) setData(loaded);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setData({ items: [], total: 0, page: 1, pageSize: PROGRAMS_PAGE_SIZE });
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити програми',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [page, reloadKey, notify]);

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === undefined) return;

    setDeleting(true);

    try {
      await deleteProgram(deleteTarget.id);
      notify('Програму видалено', 'success');
      setDeleteTarget(undefined);
      setReloadKey((key) => key + 1);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Не вдалося видалити програму', 'danger');
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = data === undefined ? 1 : Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <>
      <WorkoutTabs active="/dashboard/programs" />

      <PageHeader
        title="Програми"
        description="Шаблони тренувань, які ви призначатимете клієнтам"
        actions={
          <Link href="/dashboard/programs/new">
            <Button variant="primary">Нова програма</Button>
          </Link>
        }
      />

      {data === undefined ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Завантаження програм" />
        </div>
      ) : data.total === 0 ? (
        <EmptyState
          title="Ще немає програм"
          description="Складіть першу програму із секцій та вправ вашої бібліотеки."
          action={
            <Link href="/dashboard/programs/new">
              <Button variant="primary">Нова програма</Button>
            </Link>
          }
        />
      ) : (
        <>
          <Table caption="Ваші програми тренувань">
            <Thead>
              <Tr>
                <Th>Програма</Th>
                <Th>Тип</Th>
                <Th>Секції</Th>
                <Th>Вправи</Th>
                <Th>
                  <span className="sr-only">Дії</span>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.items.map((program) => (
                <Tr key={program.id}>
                  <Td>
                    <Link
                      href={`/dashboard/programs/${program.id}`}
                      className="font-medium text-text hover:underline"
                    >
                      {program.name}
                    </Link>
                    {program.description !== null && (
                      <p className="mt-0.5 max-w-md truncate text-xs text-text-secondary">
                        {program.description}
                      </p>
                    )}
                  </Td>
                  <Td>
                    <Badge tone="neutral">{WORKOUT_TYPE_LABELS[program.type]}</Badge>
                  </Td>
                  <Td numeric>{program.sectionCount}</Td>
                  <Td numeric>{program.exerciseCount}</Td>
                  <Td>
                    <DropdownMenu
                      triggerLabel={`Дії з програмою «${program.name}»`}
                      trigger={<span aria-hidden="true">⋯</span>}
                    >
                      {(close) => (
                        <DropdownItem
                          onClick={() => {
                            close();
                            setDeleteTarget(program);
                          }}
                        >
                          Видалити
                        </DropdownItem>
                      )}
                    </DropdownMenu>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2">
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
        </>
      )}

      <Modal
        open={deleteTarget !== undefined}
        onClose={() => {
          setDeleteTarget(undefined);
        }}
        title="Видалити програму?"
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
          «{deleteTarget?.name}» буде видалено разом з усіма секціями та приписами. Вправи з
          бібліотеки залишаться.
        </p>
      </Modal>
    </>
  );
}
