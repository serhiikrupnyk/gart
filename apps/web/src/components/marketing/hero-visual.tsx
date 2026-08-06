import { Flame, TrendingUp } from 'lucide-react';

/**
 * The hero's product shot: three real Gart surfaces — the client's workout
 * card, a habit streak, a progress chart — composed from the same tokens the
 * app uses, so it cannot drift from the product. No screenshots, no images,
 * nothing to load.
 *
 * Decorative from top to bottom: every fact shown here is also stated in the
 * copy above it, so the composition is hidden from assistive technology rather
 * than read out as a run of numbers.
 *
 * On phones the third card drops away and the rest stack — three across at
 * 375px would be unreadable rather than impressive.
 */
export function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative select-none">
      {/* Ambient ember, behind the panel rather than on it. */}
      <div className="pointer-events-none absolute -inset-x-8 -top-10 bottom-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 size-[34rem] max-w-[130%] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent/20 blur-3xl motion-safe:animate-ember dark:bg-accent/15" />
      </div>

      <div className="rounded-panel border border-border bg-surface/80 p-3 shadow-e4 backdrop-blur-sm sm:p-4">
        {/* The highlight along the top edge is what makes it read as a surface. */}
        <div className="relative overflow-hidden rounded-[calc(var(--radius-panel)-0.5rem)] bg-bg-subtle p-3 before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-border-strong before:to-transparent sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Today's workout — the client's home screen. */}
            <div className="rounded-card border border-border bg-surface p-4 shadow-e2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text">Сьогодні</span>
                <span className="rounded-full bg-accent px-2 py-0.5 text-2xs font-medium text-accent-contrast">
                  Силове
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {[
                  ['Присідання зі штангою', '5×5 · 82,5 кг'],
                  ['Румунська тяга', '3×8 · 60 кг'],
                ].map(([name, load]) => (
                  <div key={name} className="rounded-control bg-bg-subtle px-3 py-2">
                    <p className="text-xs text-text-secondary">{name}</p>
                    <p className="text-sm font-semibold tabular-nums text-text">{load}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex h-9 items-center justify-center rounded-control bg-accent text-xs font-medium text-accent-contrast">
                Виконано
              </div>
            </div>

            {/* Habit streak. */}
            <div className="flex flex-col justify-between rounded-card border border-border bg-surface p-4 shadow-e2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-8 items-center justify-center rounded-full bg-accent-subtle">
                    <Flame className="size-4 text-accent-text" />
                  </span>
                  <span className="text-sm font-semibold text-text">7 днів поспіль</span>
                </div>
                <p className="mt-3 text-xs text-text-secondary">Вода · 8 склянок</p>
              </div>

              <div className="mt-4 flex gap-1.5">
                {Array.from({ length: 7 }, (_, index) => (
                  <span
                    key={index}
                    className={
                      index < 5
                        ? 'h-8 flex-1 rounded-full bg-success/80'
                        : 'h-8 flex-1 rounded-full border border-dashed border-border-strong'
                    }
                  />
                ))}
              </div>
            </div>

            {/* Progress — the card phones drop. */}
            <div className="hidden flex-col justify-between rounded-card border border-border bg-surface p-4 shadow-e2 sm:col-span-2 sm:flex lg:col-span-1">
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-text">
                  <TrendingUp className="size-4 text-accent-text" />
                  Вага
                </span>
                <span className="text-sm tabular-nums text-text-secondary">83,0 кг</span>
              </div>

              <svg
                viewBox="0 0 180 64"
                preserveAspectRatio="none"
                className="mt-4 h-20 w-full"
                role="presentation"
              >
                <defs>
                  <linearGradient id="hero-spark" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g className="text-accent">
                  <path d="M6,16 48,26 90,34 132,40 174,50 174,64 6,64Z" fill="url(#hero-spark)" />
                  <polyline
                    points="6,16 48,26 90,34 132,40 174,50"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
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
