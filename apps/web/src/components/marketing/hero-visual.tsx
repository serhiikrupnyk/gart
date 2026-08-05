import { Flame, TrendingUp } from 'lucide-react';

/**
 * The hero's product shot: three real Gart surfaces — the client's workout
 * card, a habit streak, a progress chart — composed from the same tokens the
 * app uses, so it cannot drift from the product. No screenshots, no images.
 *
 * Nothing here clips. An earlier version put `overflow-hidden` on the
 * container holding the cards so a top-edge highlight would follow its
 * corners, which sliced the cards' own shadows at the panel edge. The
 * highlight is now a plain inset element and no ancestor of a card clips.
 *
 * Decorative throughout: every figure is also stated in the copy above it, so
 * the whole composition is hidden from assistive technology.
 */
export function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative isolate select-none">
      {/* Ambient ember. Clipped inside its own layer, well behind the cards. */}
      <div className="pointer-events-none absolute -inset-x-6 -top-12 bottom-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 size-[32rem] max-w-[130%] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent/25 blur-3xl motion-safe:animate-ember dark:bg-accent/20" />
      </div>

      <div className="relative rounded-panel border-2 border-border bg-surface p-2 shadow-e4 sm:p-3">
        {/* The top-edge highlight: inset, so it needs no clipping ancestor. */}
        <span className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-border-strong to-transparent" />

        <div className="rounded-[calc(var(--radius-panel)-0.5rem)] bg-bg-subtle p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Today's workout — the client's home screen. */}
            <div className="rounded-card border border-border bg-surface p-4 shadow-e2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-text">Сьогодні</span>
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-2xs font-bold text-accent-contrast">
                  Силове
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {[
                  ['Присідання зі штангою', '5×5 · 82,5 кг'],
                  ['Румунська тяга', '3×8 · 60 кг'],
                ].map(([name, load]) => (
                  <div key={name} className="rounded-control bg-bg-subtle px-3 py-2">
                    <p className="truncate text-xs text-text-secondary">{name}</p>
                    <p className="text-sm font-bold tabular-nums text-text">{load}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex h-10 items-center justify-center rounded-control bg-accent text-xs font-bold text-accent-contrast">
                Виконано
              </div>
            </div>

            {/* Habit streak. */}
            <div className="flex flex-col justify-between rounded-card border border-border bg-surface p-4 shadow-e2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-subtle">
                    <Flame className="size-4 text-accent-text" />
                  </span>
                  <span className="text-sm font-bold text-text">7 днів поспіль</span>
                </div>
                <p className="mt-3 text-xs text-text-secondary">Вода · 8 склянок</p>
              </div>

              <div className="mt-4 flex gap-1.5">
                {Array.from({ length: 7 }, (_, index) => (
                  <span
                    key={index}
                    className={
                      index < 5
                        ? 'h-9 flex-1 rounded-full bg-success/80'
                        : 'h-9 flex-1 rounded-full border-2 border-dashed border-border-strong'
                    }
                  />
                ))}
              </div>
            </div>

            {/* Progress. Phones drop it rather than shrink three across. */}
            <div className="hidden flex-col justify-between rounded-card border border-border bg-surface p-4 shadow-e2 sm:col-span-2 sm:flex lg:col-span-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-bold text-text">
                  <TrendingUp className="size-4 shrink-0 text-accent-text" />
                  Вага
                </span>
                <span className="shrink-0 text-sm tabular-nums text-text-secondary">83,0 кг</span>
              </div>

              <svg
                viewBox="0 0 180 64"
                preserveAspectRatio="none"
                className="mt-4 h-20 w-full"
                role="presentation"
              >
                <defs>
                  <linearGradient id="hero-spark" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g className="text-accent">
                  <path d="M6,16 48,26 90,34 132,40 174,50 174,64 6,64Z" fill="url(#hero-spark)" />
                  <polyline
                    points="6,16 48,26 90,34 132,40 174,50"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              </svg>

              <p className="mt-3 text-xs text-text-secondary">−2,4 кг за 6 тижнів</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
