'use client';

import { type ReactNode, useId, useRef } from 'react';

import { cx } from '@/lib/cx';

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}

/**
 * Follows the WAI-ARIA tabs pattern: arrow keys move between tabs, only the
 * active tab is in the tab order, and each panel is linked to its tab.
 */
export function Tabs({ items, value, onChange, label }: TabsProps) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  function move(direction: 1 | -1): void {
    const index = items.findIndex((item) => item.value === value);
    const next = items[(index + direction + items.length) % items.length];

    if (next !== undefined) {
      onChange(next.value);
      listRef.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
    }
  }

  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-control border border-border bg-bg-subtle p-1 shadow-inner"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            move(1);
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            move(-1);
          }
        }}
      >
        {items.map((item) => {
          const selected = item.value === value;

          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.value}`}
              data-value={item.value}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.value}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                onChange(item.value);
              }}
              className={cx(
                'min-h-9 whitespace-nowrap rounded-[0.55rem] px-3.5 py-2 text-sm font-semibold transition-[color,background-color,box-shadow]',
                selected
                  ? 'bg-surface text-text shadow-e1'
                  : 'text-text-secondary hover:bg-surface/60 hover:text-text',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.value}
          role="tabpanel"
          id={`${baseId}-panel-${item.value}`}
          aria-labelledby={`${baseId}-tab-${item.value}`}
          hidden={item.value !== value}
          className="pt-5"
        >
          {item.value === value && item.content}
        </div>
      ))}
    </div>
  );
}
