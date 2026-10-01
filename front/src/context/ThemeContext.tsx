'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

// Phase 11.1 — dark mode without a dependency: the `dark` class on <html>
// switches every design token, localStorage remembers the choice, and an inline
// script in the root layout applies it before first paint (no flash).

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'jt_theme';

export function readStoredTheme(storage: Pick<Storage, 'getItem'>): Theme | null {
  const value = storage.getItem(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

export function systemTheme(win: Pick<Window, 'matchMedia'>): Theme {
  const dark =
    typeof win.matchMedia === 'function' &&
    win.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
}

export function applyTheme(doc: Document, theme: Theme) {
  doc.documentElement.classList.toggle('dark', theme === 'dark');
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // SSR renders light; the inline head script already applied the stored theme
  // to <html>, and this effect adopts it into state after hydration.
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const initial = readStoredTheme(window.localStorage) ?? systemTheme(window);
    setTheme(initial);
    applyTheme(document, initial);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      applyTheme(document, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
