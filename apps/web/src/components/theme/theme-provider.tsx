'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { THEME_COOKIE, type ThemePreference } from '@/lib/theme';

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

/**
 * The initial preference comes from the server, which read it from the cookie —
 * so there is nothing to synchronise after hydration and no first render with
 * the wrong value.
 */
export function ThemeProvider({
  initial,
  children,
}: {
  initial: ThemePreference;
  children: ReactNode;
}) {
  const [preference, setPreference] = useState<ThemePreference>(initial);

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
    // A cookie rather than localStorage, so the server can read it next time.
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${String(ONE_YEAR_SECONDS)}; samesite=lax`;
    apply(next);
    setPreference(next);
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
