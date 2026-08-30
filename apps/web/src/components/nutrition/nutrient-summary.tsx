import { NUTRIENT_UNITS, type Nutrients, type PlanTargetReport } from '@gart/shared';

import { cx } from '@/lib/cx';

const MACROS = ['kcal', 'protein', 'fat', 'carbs'] as const;
const SHORT: Record<(typeof MACROS)[number], string> = {
  kcal: 'Ккал',
  protein: 'Б',
  fat: 'Ж',
  carbs: 'В',
};

/** «190,00 ккал · Б 19,00 · Ж 9,50 · В 9,50» — the line under a meal. */
export function NutrientSummary({ nutrients }: { nutrients: Nutrients }) {
  return (
    <p className="tabular-nums text-sm text-text-secondary">
      <span className="font-semibold text-text">
        {nutrients.kcal} {NUTRIENT_UNITS.kcal}
      </span>
      {' · '}Б {nutrients.protein}
      {' · '}Ж {nutrients.fat}
      {' · '}В {nutrients.carbs}
      {nutrients.fibre !== null && ` · Клітк. ${nutrients.fibre}`}
    </p>
  );
}

/**
 * What the day delivers against what it aims at.
 *
 * Subtraction on the trainer's own numbers, and nothing more. Gart computes no
 * energy requirement and names no formula it has not earned the right to name,
 * so «ціль» is whatever the trainer decided and this is the arithmetic they
 * would otherwise do by hand.
 */
export function TargetReport({ report }: { report: PlanTargetReport }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {MACROS.map((key) => {
        const row = report[key];
        // Zero is neither over nor under. Rendering «+0.00» in a warning colour
        // told a trainer they had missed a target they had hit exactly.
        const exact = row.difference === '0.00';
        const over = row.difference !== null && !exact && !row.difference.startsWith('-');

        return (
          <div key={key} className="rounded-control border border-border bg-bg-subtle p-3">
            <dt className="text-2xs font-bold uppercase tracking-[0.12em] text-text-muted">
              {SHORT[key]}
            </dt>
            <dd className="mt-1 tabular-nums text-sm font-semibold text-text">{row.planned}</dd>
            {row.target === null ? (
              <dd className="mt-0.5 text-xs text-text-muted">без цілі</dd>
            ) : (
              <dd className="mt-0.5 text-xs text-text-secondary">
                ціль {row.target}
                {row.difference !== null && (
                  <span
                    className={cx(
                      'ml-1 font-semibold tabular-nums',
                      over ? 'text-warning-text' : 'text-success-text',
                    )}
                  >
                    {exact ? 'точно' : over ? `+${row.difference}` : row.difference}
                  </span>
                )}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
