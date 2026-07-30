import { useId } from 'react';

interface TextFieldProps {
  label: string;
  type: 'text' | 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  autoComplete?: string;
  disabled?: boolean;
}

export function TextField({
  label,
  type,
  value,
  onChange,
  error,
  autoComplete,
  disabled = false,
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-700">
        {label}
      </label>

      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : errorId}
        className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-neutral-100 ${
          error === undefined
            ? 'border-neutral-300 focus:border-neutral-900 focus:ring-neutral-900/20'
            : 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
        }`}
      />

      {error !== undefined && (
        <p id={errorId} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
