import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'cabadra-theme';
export type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/**
 * A real on/off switch, not prefers-color-scheme — matches the reference's
 * explicit Dark/Light pill rather than following the OS. Persisted per
 * browser (localStorage) so a receptionist's front-desk machine keeps
 * whatever was picked last, same as any other per-device UI preference.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // Private browsing / storage disabled — theme still applies for this
      // session, it just won't be remembered next time.
    }
  }, []);

  return [theme, setTheme];
}

/**
 * Switches the page to the public website's palette (`.theme-site` in
 * index.css) for as long as the calling component is mounted. Used by the
 * owner side only; on <html> rather than a wrapper div so the body
 * background follows too.
 */
export function useSiteTheme() {
  useEffect(() => {
    document.documentElement.classList.add('theme-site');
    return () => document.documentElement.classList.remove('theme-site');
  }, []);
}
