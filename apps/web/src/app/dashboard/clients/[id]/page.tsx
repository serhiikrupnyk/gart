'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublicClient } from '@gart/shared';

import { AppHeader } from '@/components/app-header';
import { InviteLink } from '@/components/invite-link';
import { StatusBadge } from '@/components/status-badge';
import { ApiError } from '@/lib/api';
import { getClient, regenerateInvite, updateClient } from '@/lib/clients';

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const [client, setClient] = useState<PublicClient | undefined>();
  const [inviteUrl, setInviteUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;

    getClient(clientId)
      .then((loaded) => {
        if (active) setClient(loaded);
      })
      .catch((caught: unknown) => {
        // 401 means the session is gone; anything else here is a 404 for a
        // client that is not ours, which is the same thing to the trainer.
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace('/login');
          return;
        }
        if (active) setError('Клієнта не знайдено');
      });

    return () => {
      active = false;
    };
  }, [clientId, router]);

  async function run(action: () => Promise<void>): Promise<void> {
    setPending(true);
    setError(undefined);

    try {
      await action();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не вдалося виконати дію');
    } finally {
      setPending(false);
    }
  }

  if (error !== undefined && client === undefined) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppHeader />
        <main className="mx-auto max-w-4xl px-6 py-10">
          <p className="text-sm text-neutral-700">{error}</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-sm font-medium text-neutral-900 underline underline-offset-4"
          >
            До списку клієнтів
          </Link>
        </main>
      </div>
    );
  }

  if (client === undefined) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppHeader />
        <main className="mx-auto max-w-4xl px-6 py-10">
          <p className="text-sm text-neutral-500">Завантаження…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link
          href="/dashboard"
          className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
        >
          ← До списку клієнтів
        </Link>

        <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight text-neutral-900">
                {client.fullName}
              </h1>
              <p className="mt-1 truncate text-sm text-neutral-500">{client.email}</p>
            </div>

            <StatusBadge status={client.status} />
          </div>

          {inviteUrl !== undefined && (
            <div className="mt-6">
              <InviteLink url={inviteUrl} />
            </div>
          )}

          {error !== undefined && (
            <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-2 border-t border-neutral-200 pt-6">
            {client.status === 'INVITED' && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    const result = await regenerateInvite(client.id);
                    setInviteUrl(result.inviteUrl);
                  })
                }
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                Перегенерувати запрошення
              </button>
            )}

            {client.status !== 'ARCHIVED' && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    setClient(await updateClient(client.id, { status: 'ARCHIVED' }));
                    setInviteUrl(undefined);
                  })
                }
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                Архівувати
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
