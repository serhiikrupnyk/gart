export const THEME_COOKIE = 'gart_theme';

export type ThemePreference = 'light' | 'dark' | 'system';

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

export function parseThemePreference(value: string | undefined): ThemePreference {
  return PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
}
