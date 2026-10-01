'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

// Sidebar-footer / header light-dark switch (Phase 11.1).
export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const nextLabel = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextLabel} theme`}
      title={`Switch to ${nextLabel} theme`}
      className={`flex h-10 w-full items-center gap-3 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
        collapsed ? 'justify-center px-2' : 'px-3'
      }`}
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      {!collapsed && <span className="text-sm font-medium">Theme</span>}
    </button>
  );
}
