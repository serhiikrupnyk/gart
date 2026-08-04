import { Flame } from 'lucide-react';

/**
 * The hero's product glimpse: three miniatures of real Gart surfaces — the
 * client's workout card, a habit streak, a progress chart — composed in plain
 * HTML/CSS from the design system. No screenshots, no images, nothing to load.
 *
 * Decorative from top to bottom: every fact shown here (5×5 · 82,5 кг, серії,
 * графіки) is stated in the copy beside it, so the whole composition is hidden
 * from assistive technology rather than read out as a word salad.
 */
export function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative mx-auto h-105 w-full max-w-105 select-none">
      {/* The ember. One radial glow behind everything, breathing slowly. */}
      <div className="absolute left-1/2 top-1/2 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/25 blur-3xl motion-safe:animate-ember dark:bg-accent/20" />

      {/* Workout card — the client's «Сьогодні». */}
      <div className="absolute left-0 top-6 w-64 -rotate-2 rounded-card border border-border bg-surface p-4 shadow-xl shadow-black/5 motion-safe:animate-drift dark:shadow-black/30">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text">Сьогодні</span>
          <span className="rounded-full bg-accent px-2 py-0.5 text-2xs font-medium text-accent-contrast">
            Силове
          </span>
        </div>
        <div className="mt-3 space-y-2">
          <div className="rounded-control bg-bg-subtle px-3 py-2">
            <p className="text-xs text-text-secondary">Присідання зі штангою</p>
            <p className="text-sm font-semibold text-text">5×5 · 82,5 кг</p>
          </div>
          <div className="rounded-control bg-bg-subtle px-3 py-2">
            <p className="text-xs text-text-secondary">Румунська тяга</p>
            <p className="text-sm font-semibold text-text">3×8 · 60 кг</p>
          </div>
        </div>
        <div className="mt-3 flex h-8 items-center justify-center rounded-control bg-accent text-xs font-medium text-accent-contrast">
          Виконано
        </div>
      </div>

      {/* Habit streak chip. */}
      <div className="absolute right-0 top-0 w-44 rotate-3 rounded-card border border-border bg-surface p-3 shadow-lg shadow-black/5 dark:shadow-black/30">
        <div className="flex items-center gap-2">
          <Flame className="size-4 text-accent" />
          <span className="text-xs font-semibold text-text">7 днів поспіль</span>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: 7 }, (_, index) => (
            <span
              key={index}
              className={
                index < 5
                  ? 'size-2 rounded-full bg-success'
                  : 'size-2 rounded-full border border-border-strong'
              }
            />
          ))}
        </div>
        <p className="mt-2 text-2xs text-text-secondary">Вода · 8 склянок</p>
      </div>

      {/* Progress mini-chart. */}
      <div className="absolute bottom-0 right-4 w-52 rotate-1 rounded-card border border-border bg-surface p-3 shadow-lg shadow-black/5 motion-safe:animate-drift motion-safe:[animation-delay:-5s] dark:shadow-black/30">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold text-text">Вага</span>
          <span className="text-xs text-text-secondary">83,0 кг</span>
        </div>
        <svg viewBox="0 0 180 56" className="mt-2 w-full">
          <polyline
            points="6,14 48,22 90,30 132,34 174,44"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-accent"
          />
          {[
            [6, 14],
            [48, 22],
            [90, 30],
            [132, 34],
            [174, 44],
          ].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="3" className="fill-accent" />
          ))}
        </svg>
      </div>
    </div>
  );
}
