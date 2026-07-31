'use client';

import { useId } from 'react';
import { LOAD_UNIT_LABELS, LOAD_UNITS, type LoadUnit } from '@gart/shared';

import { Input, Select } from '@/components/ui';

export interface LoadState {
  loadValue: number | null;
  loadUnit: LoadUnit | null;
  loadText: string | null;
}

const TEXT_MODE = 'TEXT';
const NONE_MODE = '';

/**
 * The Step 10 load rule made unrepresentable: one mode select renders one
 * input, so value+unit and text can never coexist. Switching modes clears the
 * other representation in the draft.
 */
export function LoadInput({
  value,
  onChange,
  disabled = false,
}: {
  value: LoadState;
  onChange: (next: LoadState) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const mode = value.loadText !== null ? TEXT_MODE : (value.loadUnit ?? NONE_MODE);

  function switchMode(nextMode: string): void {
    if (nextMode === NONE_MODE) {
      onChange({ loadValue: null, loadUnit: null, loadText: null });
    } else if (nextMode === TEXT_MODE) {
      onChange({ loadValue: null, loadUnit: null, loadText: '' });
    } else {
      onChange({ loadValue: value.loadValue, loadUnit: nextMode as LoadUnit, loadText: null });
    }
  }

  return (
    <div>
      <label htmlFor={`${id}-mode`} className="block text-sm font-medium text-text">
        Навантаження
      </label>

      <div className="mt-1.5 flex gap-1.5">
        <div className="w-24 shrink-0">
          <Select
            id={`${id}-mode`}
            value={mode}
            onChange={(event) => {
              switchMode(event.target.value);
            }}
            disabled={disabled}
            options={[
              { value: NONE_MODE, label: '—' },
              ...LOAD_UNITS.map((unit) => ({ value: unit, label: LOAD_UNIT_LABELS[unit] })),
              { value: TEXT_MODE, label: 'текст' },
            ]}
          />
        </div>

        {mode !== NONE_MODE && mode !== TEXT_MODE && (
          <Input
            type="number"
            inputMode="decimal"
            step="0.5"
            min={0}
            aria-label="Значення навантаження"
            value={value.loadValue ?? ''}
            onChange={(event) => {
              onChange({
                ...value,
                loadValue: event.target.value === '' ? null : Number(event.target.value),
                loadText: null,
              });
            }}
            disabled={disabled}
          />
        )}

        {mode === TEXT_MODE && (
          <Input
            type="text"
            aria-label="Текстове навантаження"
            placeholder="до відмови"
            value={value.loadText ?? ''}
            onChange={(event) => {
              onChange({ loadValue: null, loadUnit: null, loadText: event.target.value });
            }}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
