'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiFetch } from '@/lib/api';

export function AppHeader() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout(): Promise<void> {
    setSigningOut(true);

    try {
      await apiFetch<null>('/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/login');
    }
  }

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-neutral-900">
          Gart
        </Link>

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
  );
}
