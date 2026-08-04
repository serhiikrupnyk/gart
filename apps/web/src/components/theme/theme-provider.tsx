'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { parseThemePreference, THEME_COOKIE, type ThemePreference } from '@/lib/theme';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

interface ThemeContextValue {
  preference: ThemePreference;
  choose: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(preference: ThemePreference): void {
  const root = document.documentElement;

  root.dataset.theme = preference;
  root.classList.toggle(
    'dark',
    preference === 'dark' || (preference === 'system' && prefersDark()),
  );
}

/** The preference never changes behind React's back, so there is nothing to watch. */
function subscribeNever(): () => void {
  return () => undefined;
}

/** ThemeScript stamped the preference onto <html> before hydration began. */
function readDomPreference(): ThemePreference {
  return parseThemePreference(document.documentElement.dataset.theme);
}

function serverPreference(): ThemePreference {
  return 'system';
}

/**
 * Pages render statically, so the server cannot know the preference — but
 * ThemeScript stamps it onto <html> before first paint, and reading it back
 * through useSyncExternalStore lets React hydrate against the server's
 * neutral markup and then correct itself without a mismatch warning.
 *
 * `initial` remains for tests, which have no ThemeScript to stamp the DOM.
 */
export function ThemeProvider({
  initial,
  children,
}: {
  initial?: ThemePreference;
  children: ReactNode;
}) {
  const domPreference = useSyncExternalStore(subscribeNever, readDomPreference, serverPreference);
  const [override, setOverride] = useState<ThemePreference | undefined>();

  const preference = override ?? initial ?? domPreference;

  // Only while following the system: keep the class in step if the operating
  // system flips mid-session. Touches the DOM, not React state.
  useEffect(() => {
    if (preference !== 'system') {
      return;
    }

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      apply('system');
    };

    query.addEventListener('change', onChange);

    return () => {
      query.removeEventListener('change', onChange);
    };
  }, [preference]);

  const choose = useCallback((next: ThemePreference) => {
    // A cookie rather than localStorage, so ThemeScript can read it next visit.
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${String(ONE_YEAR_SECONDS)}; samesite=lax`;
    apply(next);
    setOverride(next);
  }, []);

  const value = useMemo(() => ({ preference, choose }), [preference, choose]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }

  return context;
}
