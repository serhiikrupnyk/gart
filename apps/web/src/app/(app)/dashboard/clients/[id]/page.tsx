'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { INACTIVITY_DAYS, type ClientListItem } from '@gart/shared';
import { ArrowLeft } from 'lucide-react';

import { ClientActivity } from '@/components/clients/client-activity';
import { ClientChat } from '@/components/chat/client-chat';
import { ClientHabits } from '@/components/habits/client-habits';
import { ClientProgressPanel } from '@/components/progress/client-progress';
import { ClientAssignments } from '@/components/clients/client-assignments';
import { ClientNutritionPlans } from '@/components/nutrition/client-nutrition-plans';
import { ClientStatusBadge } from '@/components/clients/client-status-badge';
import { InviteLink } from '@/components/clients/invite-link';
import { PageHeader } from '@/components/layout/page-header';
import { Button, Card, DetailSkeleton, EmptyState, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getClient, regenerateInvite, updateClient } from '@/lib/clients';
import { ProgressLink } from '@/components/layout/navigation-progress';

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { notify } = useToast();

  const [client, setClient] = useState<ClientListItem | undefined>();
  // Read once, not on every render: the clock is not React state.
  const [now] = useState(() => Date.now());
  const [inviteUrl, setInviteUrl] = useState<string | undefined>();
  const [notFound, setNotFound] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;

    getClient(clientId)
      .then((loaded) => {
        if (active) setClient(loaded);
      })
      .catch((caught: unknown) => {
        // 401 means the session is gone; anything else is a 404 for a client
        // that is not ours, which is the same thing from here.
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace('/login');
          return;
        }
        if (active) setNotFound(true);
      });

    return () => {
      active = false;
    };
  }, [clientId, router]);

  async function run(action: () => Promise<void>): Promise<void> {
    setPending(true);

    try {
      await action();
    } catch (caught) {
      notify(caught instanceof ApiError ? caught.message : 'Не вдалося виконати дію', 'danger');
    } finally {
      setPending(false);
    }
  }

  if (notFound) {
    return (
      <EmptyState
        title="Клієнта не знайдено"
        description="Можливо, його видалено або він належить іншому тренеру."
        action={
          <ProgressLink href="/dashboard">
            <Button variant="secondary">До списку клієнтів</Button>
          </ProgressLink>
        }
      />
    );
  }

  if (client === undefined) {
    return <DetailSkeleton label="Завантаження клієнта" />;
  }

  return (
    <>
      <ProgressLink
        href="/dashboard"
        className="text-sm text-text-secondary underline underline-offset-4 hover:text-text"
      >
        <ArrowLeft className="inline size-4 align-[-3px]" aria-hidden="true" /> До списку клієнтів
      </ProgressLink>

      <div className="mt-4">
        <PageHeader title={client.fullName} description={client.email} />
      </div>

      <InactivityBanner client={client} now={now} />

      <Card>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-text-secondary">Статус</span>
          <ClientStatusBadge status={client.status} />
        </div>

        {inviteUrl !== undefined && (
          <div className="mt-6">
            <InviteLink url={inviteUrl} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-6">
          {client.status === 'INVITED' && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  const result = await regenerateInvite(client.id);
                  setInviteUrl(result.inviteUrl);
                  notify('Нове запрошення згенеровано', 'success');
                })
              }
            >
              Перегенерувати запрошення
            </Button>
          )}

          {client.status === 'ARCHIVED' ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  // A client who never accepted returns to INVITED; one with an
                  // account returns to ACTIVE. The API rejects ACTIVE without a
                  // linked user, so the choice has to match reality.
                  const next = client.hasAccount ? 'ACTIVE' : 'INVITED';
                  const updated = await updateClient(client.id, { status: next });

                  setClient((current) =>
                    current === undefined ? undefined : { ...current, ...updated },
                  );
                  notify('Клієнта відновлено', 'success');
                })
              }
            >
              Відновити з архіву
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  const updated = await updateClient(client.id, { status: 'ARCHIVED' });

                  setClient((current) =>
                    current === undefined ? undefined : { ...current, ...updated },
                  );
                  setInviteUrl(undefined);
                  notify('Клієнта архівовано', 'success');
                })
              }
            >
              Архівувати
            </Button>
          )}
        </div>
      </Card>

      <ClientActivity clientId={client.id} />

      <ClientAssignments clientId={client.id} />

      <ClientNutritionPlans clientId={client.id} />

      <ClientProgressPanel clientId={client.id} />

      <ClientHabits clientId={client.id} />

      <ClientChat clientId={client.id} />
    </>
  );
}

/**
 * The prompt an inactivity alert exists to create. It reports exactly what it
 * measures — days since the last recorded workout — and offers the one action
 * worth taking, rather than merely stating a problem.
 */
function InactivityBanner({ client, now }: { client: ClientListItem; now: number }) {
  if (client.status !== 'ACTIVE') {
    return null;
  }

  const days =
    client.lastLoggedAt === null
      ? null
      : Math.floor((now - new Date(client.lastLoggedAt).getTime()) / 86_400_000);

  if (days !== null && days <= INACTIVITY_DAYS) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-warning/30 bg-warning/10 px-4 py-3">
      <p className="text-sm text-text">
        {days === null
          ? 'Записів тренувань ще немає.'
          : `Немає записів тренувань уже ${String(days)} днів.`}
      </p>
      <a
        href="#chat"
        className="shrink-0 text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        Написати клієнту
      </a>
    </div>
  );
}
