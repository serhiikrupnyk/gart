import { UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The first thing a new trainer sees. Rather than an empty box, it shows the
 * shape of what is about to exist — three ghost rows behind an ember — so the
 * page reads as ready rather than broken. Drawn in CSS: no assets, nothing to
 * load, and it inherits the theme for free.
 */
export function ClientsEmpty({ action }: { action: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-border bg-surface px-6 py-10 text-center sm:py-14">
      {/* The panel spans the working area; its content keeps a readable measure. */}
      <div className="mx-auto max-w-lg">
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-0 size-72 -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent/10 blur-3xl motion-safe:animate-ember"
        />

        {/* The list that is about to exist. */}
        <div
          aria-hidden="true"
          className="relative mx-auto mb-8 hidden w-full max-w-xs space-y-2 sm:block"
        >
          {[1, 0.6, 0.3].map((opacity, index) => (
            <div
              key={index}
              style={{ opacity }}
              className="flex items-center gap-3 rounded-control border border-border bg-bg-subtle px-3 py-2.5"
            >
              <span className="size-7 shrink-0 rounded-full bg-border" />
              <span className="h-2.5 flex-1 rounded-full bg-border" />
              <span className="h-4 w-12 shrink-0 rounded-full bg-border" />
            </div>
          ))}
        </div>

        <div className="relative">
          <span className="mx-auto mb-4 inline-flex size-11 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
            <UserPlus className="size-5" aria-hidden="true" />
          </span>

          <h2 className="text-base font-semibold text-text">Ще немає клієнтів</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-secondary">
            Додайте першого клієнта — ми згенеруємо для нього посилання-запрошення. Він отримає
            застосунок під вашим брендом безкоштовно.
          </p>

          <div className="mt-6 flex justify-center">{action}</div>
        </div>
      </div>
    </div>
  );
}
