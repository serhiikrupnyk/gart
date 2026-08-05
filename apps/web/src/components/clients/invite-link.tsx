'use client';

import { CircleCheck, Copy, TriangleAlert } from 'lucide-react';

import { Button, useToast } from '@/components/ui';

/**
 * The raw token exists only in this URL — the API stores nothing but its hash,
 * so once it leaves the screen it cannot be recovered, only regenerated. Hence
 * the warning and the copy affordance.
 */
export function InviteLink({ url }: { url: string }) {
  const { notify } = useToast();

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      notify('Посилання скопійовано', 'success');
    } catch {
      // Clipboard permission can be refused; the field stays selectable.
      notify('Не вдалося скопіювати — виділіть посилання вручну', 'danger');
    }
  }

  return (
    <div role="status" className="rounded-card border border-accent/40 bg-accent-subtle p-4">
      <div className="flex items-center gap-2">
        <CircleCheck className="size-5 text-accent-text" aria-hidden="true" />
        <p className="text-sm font-semibold text-text">Клієнта створено</p>
      </div>

      <p className="mt-1.5 text-sm text-text-secondary">
        Надішліть це посилання клієнту, щоб він створив пароль.
      </p>

      <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-text">
        <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning-text" aria-hidden="true" />
        Показуємо лише один раз — потім доведеться згенерувати нове.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(event) => {
            event.target.select();
          }}
          aria-label="Посилання-запрошення"
          className="min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-text"
        />

        <Button variant="primary" size="md" onClick={() => void handleCopy()}>
          <Copy className="size-4" aria-hidden="true" />
          Копіювати
        </Button>
      </div>
    </div>
  );
}
