'use client';

import Link from 'next/link';
import { Activity, UserCheck, UserPlus, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ClientListItem, ClientWithInvite, PublicSubscription } from '@gart/shared';

import { AllowanceNotice } from '@/components/billing/allowance-notice';
import { AddClientModal } from '@/components/clients/add-client-modal';
import { ClientRow } from '@/components/clients/client-row';
import { ClientsEmpty } from '@/components/clients/clients-empty';
import { ClientsFilters, type ClientFilter } from '@/components/clients/clients-filters';
import { InviteLink } from '@/components/clients/invite-link';
import { PageHeader } from '@/components/layout/page-header';
import {
  Badge,
  Button,
  buttonClasses,
  EmptyState,
  Skeleton,
  Table,
  TableSkeleton,
  Tbody,
  Th,
  Thead,
  Tr,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getSubscription } from '@/lib/billing';
import { listClients } from '@/lib/clients';
import { cx } from '@/lib/cx';
import { pluralUk } from '@/lib/workout-format';

/**
 * Everything the trainer can slice the list by, in the order they scan it.
 * Counted over the search-filtered roster, so a pill never advertises rows the
 * table will not show.
 */
function buildFilters(clients: ClientListItem[]) {
  return [
    { key: 'ALL' as const, label: 'Усі', count: clients.length },
    {
      key: 'ATTENTION' as const,
      label: 'Потребують уваги',
      count: clients.filter((client) => client.attention !== null).length,
    },
    {
      key: 'ACTIVE' as const,
      label: 'Активні',
      count: clients.filter((client) => client.status === 'ACTIVE').length,
    },
    {
      key: 'INVITED' as const,
      label: 'Запрошені',
      count: clients.filter((client) => client.status === 'INVITED').length,
    },
    {
      key: 'ARCHIVED' as const,
      label: 'В архіві',
      count: clients.filter((client) => client.status === 'ARCHIVED').length,
    },
  ];
}

function matches(client: ClientListItem, filter: ClientFilter, query: string): boolean {
  if (filter === 'ATTENTION' && client.attention === null) return false;
  if (filter !== 'ALL' && filter !== 'ATTENTION' && client.status !== filter) return false;

  const term = query.trim().toLowerCase();

  if (term.length === 0) return true;

  return client.fullName.toLowerCase().includes(term) || client.email.toLowerCase().includes(term);
}

export default function DashboardPage() {
  const { notify } = useToast();

  const [clients, setClients] = useState<ClientListItem[] | undefined>();
  const [subscription, setSubscription] = useState<PublicSubscription | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [created, setCreated] = useState<ClientWithInvite | undefined>();
  const [filter, setFilter] = useState<ClientFilter>('ALL');
  const [query, setQuery] = useState('');
  // Bumped to re-run the load; the effect owns the fetch so state is only ever
  // set from a settled promise, never synchronously during the effect.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    // Filtering and search run over the loaded list rather than the wire: this
    // endpoint returns every client in one response. If rosters outgrow that,
    // the next step is a paged /clients (limit/offset + total) with these
    // controls moved into the query — not client-side windowing over a payload
    // that is already too large to send.
    listClients()
      .then((loaded) => {
        if (active) setClients(loaded);
      })
      .catch((error: unknown) => {
        if (!active) return;
        // Without this an API failure leaves the spinner up for ever.
        setClients([]);
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити клієнтів',
          'danger',
        );
      });

    // The allowance, so the screen can say what the server would say anyway —
    // BEFORE the trainer fills in a form. A failure here is deliberately silent:
    // it costs a banner, not the roster, and the API still refuses over the
    // limit regardless of what this screen managed to load.
    getSubscription()
      .then((loaded) => {
        if (active) setSubscription(loaded);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [reloadKey, notify]);

  // Only ever true on the trial today: every paid plan is unlimited.
  const allowanceFull =
    subscription !== null &&
    subscription.maxClients !== null &&
    subscription.clientCount >= subscription.maxClients;

  function handleCreated(result: ClientWithInvite): void {
    setCreated(result);
    setModalOpen(false);
    // A new client is INVITED; leaving a filter or search active would hide the
    // row the trainer just made.
    setFilter('ALL');
    setQuery('');
    setReloadKey((key) => key + 1);
  }

  // Search first, then the status/attention slice — the pills count the former
  // so their numbers always match what selecting them yields.
  const searched = useMemo(
    () => (clients ?? []).filter((client) => matches(client, 'ALL', query)),
    [clients, query],
  );

  const visible = useMemo(
    () => searched.filter((client) => matches(client, filter, '')),
    [searched, filter],
  );

  const needAttention = (clients ?? []).filter((client) => client.attention !== null).length;

  function openModal(): void {
    setCreated(undefined);
    setModalOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Клієнти"
        description="Запрошуйте клієнтів і стежте за їхнім статусом"
        meta={
          clients !== undefined && clients.length > 0 ? (
            <Badge tone={needAttention > 0 ? 'warning' : 'neutral'}>
              {needAttention > 0
                ? `${String(needAttention)} ${pluralUk(needAttention, 'потребує', 'потребують', 'потребують')} уваги`
                : `${String(clients.length)} ${pluralUk(clients.length, 'клієнт', 'клієнти', 'клієнтів')}`}
            </Badge>
          ) : undefined
        }
        actions={
          allowanceFull ? (
            // Not a disabled button: a control that does nothing explains
            // nothing. This one goes where the limit is actually lifted.
            <Link
              href="/dashboard/billing"
              className={cx(buttonClasses('primary', 'md'), 'justify-center')}
            >
              Оформити підписку
            </Link>
          ) : (
            <Button variant="primary" onClick={openModal}>
              <UserPlus className="size-4" aria-hidden="true" />
              Додати клієнта
            </Button>
          )
        }
      />

      {allowanceFull && subscription !== null && <AllowanceNotice subscription={subscription} />}

      {created !== undefined && (
        <div className="mb-6">
          <InviteLink url={created.inviteUrl} />
        </div>
      )}

      {clients !== undefined && clients.length > 0 && (
        <section aria-label="Огляд клієнтів" className="mb-6 grid gap-3 sm:grid-cols-3 lg:mb-8">
          <OverviewMetric
            icon={UsersRound}
            label="Усього клієнтів"
            value={clients.length}
            detail="у вашому просторі"
          />
          <OverviewMetric
            icon={UserCheck}
            label="Активні"
            value={clients.filter((client) => client.status === 'ACTIVE').length}
            detail="з активним супроводом"
          />
          <OverviewMetric
            icon={Activity}
            label="Потребують уваги"
            value={needAttention}
            detail={needAttention > 0 ? 'варто переглянути сьогодні' : 'усе під контролем'}
            accent={needAttention > 0}
          />
        </section>
      )}

      {clients === undefined ? (
        <>
          <div aria-hidden="true" className="mb-4 flex flex-wrap items-center gap-3">
            {['w-16', 'w-36', 'w-24', 'w-28'].map((width) => (
              <Skeleton key={width} className={`h-10 rounded-full ${width}`} />
            ))}
            <Skeleton className="ml-auto h-10 w-full sm:w-64" />
          </div>
          <TableSkeleton rows={6} columns={4} label="Завантаження клієнтів" />
        </>
      ) : clients.length === 0 ? (
        <ClientsEmpty
          action={
            <Button
              variant="primary"
              onClick={() => {
                setModalOpen(true);
              }}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Додати клієнта
            </Button>
          }
        />
      ) : (
        <>
          <ClientsFilters
            counts={buildFilters(searched)}
            active={filter}
            onChange={setFilter}
            query={query}
            onQueryChange={setQuery}
          />

          {/*
            Filtering swaps rows in and out and can replace the table entirely.
            Without this the whole triage interaction is silent: `aria-pressed`
            reports the chip's own state, never the result of pressing it.
          */}
          <p aria-live="polite" className="sr-only">
            {`Показано ${String(visible.length)} ${pluralUk(visible.length, 'клієнта', 'клієнтів', 'клієнтів')} із ${String(clients.length)}`}
          </p>

          {visible.length === 0 ? (
            <EmptyState
              title="Нічого не знайдено"
              description="Жоден клієнт не відповідає фільтру. Спробуйте змінити його або очистити пошук."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilter('ALL');
                    setQuery('');
                  }}
                >
                  Скинути фільтри
                </Button>
              }
            />
          ) : (
            <Table caption="Список ваших клієнтів">
              <Thead>
                <Tr>
                  <Th>Клієнт</Th>
                  <Th>Статус</Th>
                  <Th>Потребує уваги</Th>
                  <Th>
                    <span className="sr-only">Відкрити</span>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {visible.map((client) => (
                  <ClientRow key={client.id} client={client} now={new Date()} />
                ))}
              </Tbody>
            </Table>
          )}
        </>
      )}

      <AddClientModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
        }}
        onCreated={handleCreated}
      />
    </>
  );
}

function OverviewMetric({
  icon: Icon,
  label,
  value,
  detail,
  accent = false,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className="relative overflow-hidden rounded-card border border-border bg-surface p-4 shadow-e1 sm:p-5">
      {accent && (
        <span
          aria-hidden="true"
          className="absolute -right-8 -top-8 size-24 rounded-full bg-accent/10 blur-2xl"
        />
      )}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-text-secondary">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-[-0.05em] text-text tabular">{value}</p>
          <p className="mt-1 text-xs text-text-muted">{detail}</p>
        </div>
        <span
          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-card ${accent ? 'bg-accent text-accent-contrast' : 'bg-bg-subtle text-text-secondary'}`}
        >
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}
