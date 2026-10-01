import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  ThemeProvider,
  readStoredTheme,
  useTheme,
} from './ThemeContext';

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      theme:{theme}
    </button>
  );
}

describe('readStoredTheme', () => {
  it('accepts stored light/dark values', () => {
    expect(readStoredTheme({ getItem: () => 'dark' })).toBe('dark');
    expect(readStoredTheme({ getItem: () => 'light' })).toBe('light');
  });

  it('returns null for missing or garbage values', () => {
    expect(readStoredTheme({ getItem: () => null })).toBeNull();
    expect(readStoredTheme({ getItem: () => 'blue' })).toBeNull();
  });
});

describe('ThemeProvider', () => {
  it('toggles the dark class on <html> and persists the choice', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button');
    expect(button.textContent).toBe('theme:light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    act(() => {
      button.click();
    });

    expect(button.textContent).toBe('theme:dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('honors the stored preference on mount (no flash of the wrong theme)', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button').textContent).toBe('theme:dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('throws a clear error when the hook is used outside the provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useTheme must be used within ThemeProvider');
    consoleError.mockRestore();
  });
});
