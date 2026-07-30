'use client';

import type { ThemePreference } from '@/lib/theme';
import { DropdownItem, DropdownMenu } from '@/components/ui';
import { useTheme } from './theme-provider';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Світла' },
  { value: 'dark', label: 'Темна' },
  { value: 'system', label: 'Як у системі' },
];

const ICONS: Record<ThemePreference, string> = {
  light: '☀',
  dark: '☾',
  system: '◐',
};

export function ThemeToggle() {
  const { preference, choose } = useTheme();

  return (
    <DropdownMenu
      triggerLabel="Тема оформлення"
      trigger={<span className="px-1 text-base leading-none">{ICONS[preference]}</span>}
    >
      {(close) => (
        <>
          {OPTIONS.map((option) => (
            <DropdownItem
              key={option.value}
              onClick={() => {
                choose(option.value);
                close();
              }}
            >
              <span className="flex items-center justify-between gap-4">
                {option.label}
                {preference === option.value && <span aria-hidden="true">✓</span>}
                {preference === option.value && <span className="sr-only">(обрано)</span>}
              </span>
            </DropdownItem>
          ))}
        </>
      )}
    </DropdownMenu>
  );
}
