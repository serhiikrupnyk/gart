'use client';

import { useState } from 'react';

/**
 * The raw token exists only in this URL — the API stores nothing but its hash,
 * so once the trainer navigates away it cannot be recovered, only regenerated.
 * The copy affordance and the warning both follow from that.
 */
export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the input stays selectable either way.
      setCopied(false);
    }
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-medium text-emerald-900">Посилання-запрошення</p>
      <p className="mt-1 text-xs text-emerald-700">
        Надішліть його клієнту. Показуємо лише один раз — потім доведеться згенерувати нове.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(event) => {
            event.target.select();
          }}
          aria-label="Посилання-запрошення"
          className="min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 font-mono text-xs text-neutral-800 outline-none focus:ring-2 focus:ring-emerald-500/30"
        />

        <button
          type="button"
          onClick={() => void handleCopy()}
          className="shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
        >
          {copied ? 'Скопійовано' : 'Копіювати'}
        </button>
      </div>
    </div>
  );
}
