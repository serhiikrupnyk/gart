'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublicClient } from '@gart/shared';

import { ClientAssignments } from '@/components/clients/client-assignments';
import { ClientStatusBadge } from '@/components/clients/client-status-badge';
import { InviteLink } from '@/components/clients/invite-link';
import { PageHeader } from '@/components/layout/page-header';
import { Button, Card, EmptyState, Spinner, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getClient, regenerateInvite, updateClient } from '@/lib/clients';

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { notify } = useToast();

  const [client, setClient] = useState<PublicClient | undefined>();
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
          <Link href="/dashboard">
            <Button variant="secondary">До списку клієнтів</Button>
          </Link>
        }
      />
    );
  }

  if (client === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" label="Завантаження клієнта" />
      </div>
    );
  }

  return (
    <>
      <Link
        href="/dashboard"
        className="text-sm text-text-secondary underline underline-offset-4 hover:text-text"
      >
        ← До списку клієнтів
      </Link>

      <div className="mt-4">
        <PageHeader title={client.fullName} description={client.email} />
      </div>

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
                  setClient(await updateClient(client.id, { status: next }));
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
                  setClient(await updateClient(client.id, { status: 'ARCHIVED' }));
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

      <ClientAssignments clientId={client.id} />
    </>
  );
}
