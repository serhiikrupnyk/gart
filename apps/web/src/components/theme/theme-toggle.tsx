'use client';

import type { ThemePreference } from '@/lib/theme';
import { Check, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { DropdownItem, DropdownMenu } from '@/components/ui';
import { useTheme } from './theme-provider';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Світла' },
  { value: 'dark', label: 'Темна' },
  { value: 'system', label: 'Як у системі' },
];

const ICONS: Record<ThemePreference, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeToggle({
  align = 'end',
  tone = 'default',
}: {
  align?: 'start' | 'end';
  tone?: 'default' | 'inverted';
} = {}) {
  const { preference, choose } = useTheme();
  const Icon = ICONS[preference];

  return (
    <DropdownMenu
      align={align}
      triggerLabel="Тема оформлення"
      triggerClassName={
        tone === 'inverted'
          ? 'text-[#f7f6f2] hover:bg-white/10 hover:text-white lg:text-text lg:hover:bg-bg-subtle lg:hover:text-text'
          : undefined
      }
      trigger={<Icon className="size-5" aria-hidden="true" />}
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
                {preference === option.value && <Check className="size-4" aria-hidden="true" />}
                {preference === option.value && <span className="sr-only">(обрано)</span>}
              </span>
            </DropdownItem>
          ))}
        </>
      )}
    </DropdownMenu>
  );
}
