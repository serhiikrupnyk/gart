export const THEME_COOKIE = 'gart_theme';

export type ThemePreference = 'light' | 'dark' | 'system';

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

export function parseThemePreference(value: string | undefined): ThemePreference {
  return PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
}

/**
 * What the server can decide on its own. `system` depends on the operating
 * system preference, which no request header carries — the inline script
 * resolves that case before first paint.
 */
export function resolvedOnServer(preference: ThemePreference): 'light' | 'dark' | undefined {
  return preference === 'system' ? undefined : preference;
}
