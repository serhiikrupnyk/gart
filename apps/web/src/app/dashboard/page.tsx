'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AuthSession } from '@gart/shared';

import { apiFetch } from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();

  const [session, setSession] = useState<AuthSession | undefined>();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    apiFetch<AuthSession>('/auth/me')
      .then((loaded) => {
        if (active) setSession(loaded);
      })
      .catch(() => {
        router.replace('/login');
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogout(): Promise<void> {
    setSigningOut(true);

    try {
      await apiFetch<null>('/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/login');
    }
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
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight text-neutral-900">Gart</span>

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={signingOut}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {signingOut ? 'Виходимо…' : 'Вийти'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Вітаю, {session.trainer.displayName}
        </h1>
        <p className="mt-2 text-sm text-neutral-500">{session.user.email}</p>
      </main>
    </div>
  );
}
