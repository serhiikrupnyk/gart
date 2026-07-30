'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { AuthSession, ClientWithInvite, PublicClient } from '@gart/shared';

import { AppHeader } from '@/components/app-header';
import { InviteLink } from '@/components/invite-link';
import { StatusBadge } from '@/components/status-badge';
import { SubmitButton } from '@/components/submit-button';
import { TextField } from '@/components/text-field';
import { ApiError, apiFetch } from '@/lib/api';
import { createClient, listClients } from '@/lib/clients';
import { validateEmail } from '@/lib/validation';

export default function DashboardPage() {
  const router = useRouter();

  const [session, setSession] = useState<AuthSession | undefined>();
  const [clients, setClients] = useState<PublicClient[] | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [created, setCreated] = useState<ClientWithInvite | undefined>();

  const load = useCallback(async (): Promise<void> => {
    setClients(await listClients());
  }, []);

  useEffect(() => {
    let active = true;

    apiFetch<AuthSession>('/auth/me')
      .then(async (loaded) => {
        if (!active) return;
        setSession(loaded);
        await load();
      })
      .catch(() => {
        router.replace('/login');
      });

    return () => {
      active = false;
    };
  }, [router, load]);

  function handleCreated(result: ClientWithInvite): void {
    setCreated(result);
    setFormOpen(false);
    void load();
  }

  if (session === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-500">Завантаження…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Вітаю, {session.trainer.displayName}
        </h1>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">Клієнти</h2>

            {!formOpen && (
              <button
                type="button"
                onClick={() => {
                  setFormOpen(true);
                  setCreated(undefined);
                }}
                className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
              >
                Додати клієнта
              </button>
            )}
          </div>

          {created !== undefined && (
            <div className="mt-4">
              <InviteLink url={created.inviteUrl} />
            </div>
          )}

          {formOpen && (
            <AddClientForm
              onCancel={() => {
                setFormOpen(false);
              }}
              onCreated={handleCreated}
            />
          )}

          <div className="mt-4">
            <ClientList clients={clients} />
          </div>
        </section>
      </main>
    </div>
  );
}

function ClientList({ clients }: { clients: PublicClient[] | undefined }) {
  if (clients === undefined) {
    return <p className="text-sm text-neutral-500">Завантаження…</p>;
  }

  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
        <p className="text-sm font-medium text-neutral-700">Ще немає клієнтів</p>
        <p className="mt-1 text-sm text-neutral-500">
          Додайте першого клієнта — ми згенеруємо для нього посилання-запрошення.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {clients.map((client) => (
        <li key={client.id}>
          <Link
            href={`/dashboard/clients/${client.id}`}
            className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-neutral-50 focus:outline-none focus-visible:bg-neutral-50"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-neutral-900">
                {client.fullName}
              </span>
              <span className="block truncate text-sm text-neutral-500">{client.email}</span>
            </span>

            <StatusBadge status={client.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

interface AddClientFormProps {
  onCancel: () => void;
  onCreated: (result: ClientWithInvite) => void;
}

function AddClientForm({ onCancel, onCreated }: AddClientFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();

    const errors: Record<string, string> = {};

    if (fullName.trim().length === 0) errors.fullName = "Введіть ім'я клієнта";
    const emailError = validateEmail(email);
    if (emailError !== undefined) errors.email = emailError;

    setFieldErrors(errors);
    setFormError(undefined);

    if (Object.keys(errors).length > 0) return;

    setPending(true);

    try {
      onCreated(await createClient({ fullName, email }));
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Не вдалося додати клієнта');
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mt-4 space-y-4 rounded-xl border border-neutral-200 bg-white p-4"
    >
      <TextField
        label="Ім'я та прізвище"
        type="text"
        value={fullName}
        onChange={setFullName}
        error={fieldErrors.fullName}
        autoComplete="off"
        disabled={pending}
      />

      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        error={fieldErrors.email}
        autoComplete="off"
        disabled={pending}
      />

      {formError !== undefined && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <div className="flex gap-2">
        <SubmitButton label="Створити запрошення" pendingLabel="Створюємо…" pending={pending} />

        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Скасувати
        </button>
      </div>
    </form>
  );
}
