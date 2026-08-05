'use client';

import { Search, X } from 'lucide-react';
import { useRef } from 'react';
import type { ClientStatus } from '@gart/shared';

import { CONTROL_BASE, controlBorder } from '@/components/ui';
import { cx } from '@/lib/cx';

/** «Потребують уваги» is a view over the list, not a stored status. */
export type ClientFilter = ClientStatus | 'ALL' | 'ATTENTION';

export interface FilterCount {
  key: ClientFilter;
  label: string;
  count: number;
}

/**
 * Triage controls: the counts double as filters, so the trainer sees how many
 * need them and reaches that subset in one click.
 */
export function ClientsFilters({
  counts,
  active,
  onChange,
  query,
  onQueryChange,
}: {
  counts: FilterCount[];
  active: ClientFilter;
  onChange: (next: ClientFilter) => void;
  query: string;
  onQueryChange: (next: string) => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div
        role="group"
        aria-label="Фільтр за станом"
        className="flex flex-wrap items-center gap-1.5"
      >
        {counts.map((filter) => {
          const selected = filter.key === active;

          return (
            <button
              key={filter.key}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                onChange(filter.key);
              }}
              className={cx(
                'inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors',
                selected
                  ? 'border-accent bg-accent-subtle font-medium text-accent-text'
                  : 'border-border-strong text-text-secondary hover:bg-bg-subtle hover:text-text',
              )}
            >
              {filter.label}
              {/*
                The count sits on `surface` rather than a tint of the accent:
                accent-text on a 15% accent wash measures 3.8, below AA at this
                size, while on surface it is 5.16.
              */}
              <span
                className={cx(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  selected ? 'bg-surface' : 'bg-bg-subtle',
                )}
              >
                {filter.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative ml-auto w-full sm:w-64">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary"
        />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
          }}
          aria-label="Пошук клієнтів"
          placeholder="Пошук за іменем або email"
          // WebKit paints its own cancel button for type=search; ours is the
          // one that works in every browser, so the native one is suppressed
          // rather than stacked underneath.
          className={cx(
            CONTROL_BASE,
            controlBorder(false),
            'pl-9 pr-10 [&::-webkit-search-cancel-button]:appearance-none',
          )}
        />
        {query.length > 0 && (
          <button
            type="button"
            aria-label="Очистити пошук"
            onClick={() => {
              onQueryChange('');
              // The button is about to unmount; without this, focus would fall
              // to <body> and a keyboard user would lose their place.
              searchRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-control text-text-secondary hover:bg-bg-subtle hover:text-text"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
