'use client';

import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS, type MuscleGroup } from '@gart/shared';

export interface MuscleGroupChipsProps {
  legend: string;
  selected: MuscleGroup[];
  onChange: (next: MuscleGroup[]) => void;
  /** Usually the primary group — shown disabled so it cannot double as secondary. */
  exclude?: MuscleGroup;
  disabled?: boolean;
}

/**
 * Real checkboxes styled as chips: the input stays in the accessibility tree
 * (sr-only), the label is the visual, and focus-visible rings ride on the
 * peer classes — keyboard and screen-reader behaviour come from the platform.
 */
export function MuscleGroupChips({
  legend,
  selected,
  onChange,
  exclude,
  disabled = false,
}: MuscleGroupChipsProps) {
  function toggle(group: MuscleGroup): void {
    onChange(
      selected.includes(group) ? selected.filter((entry) => entry !== group) : [...selected, group],
    );
  }

  return (
    <fieldset disabled={disabled}>
      <legend className="block text-sm font-medium text-text">{legend}</legend>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {MUSCLE_GROUPS.map((group) => {
          const isExcluded = group === exclude;
          const checked = selected.includes(group) && !isExcluded;

          return (
            <label
              key={group}
              className={isExcluded || disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
            >
              <input
                type="checkbox"
                className="peer sr-only"
                checked={checked}
                disabled={isExcluded}
                onChange={() => {
                  toggle(group);
                }}
              />
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
                  checked
                    ? 'border-accent/40 bg-accent-subtle text-accent'
                    : isExcluded
                      ? 'border-border text-text-muted'
                      : 'border-border-strong text-text-secondary hover:border-text-muted hover:text-text'
                }`}
              >
                {MUSCLE_GROUP_LABELS[group]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
