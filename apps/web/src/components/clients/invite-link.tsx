'use client';

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
    <div className="rounded-card border border-accent/40 bg-accent-subtle p-4">
      <p className="text-sm font-medium text-text">Посилання-запрошення</p>
      <p className="mt-1 text-xs text-text-secondary">
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
          className="min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-text"
        />

        <Button variant="primary" size="md" onClick={() => void handleCopy()}>
          Копіювати
        </Button>
      </div>
    </div>
  );
}
