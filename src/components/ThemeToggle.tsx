import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Theme } from '../hooks/useTheme';

interface ThemeToggleProps {
  theme: Theme;
  onChange: (t: Theme) => void;
}

/** The Dark/Light segmented pill from the reference — the active side gets a white pill behind it, the inactive side stays plain text on the surrounding surface. */
export function ThemeToggle({ theme, onChange }: ThemeToggleProps) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-primary-container/40 rounded-full p-1">
      <button
        type="button"
        onClick={() => onChange('dark')}
        aria-pressed={theme === 'dark'}
        className={`h-7 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors ${
          theme === 'dark' ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-primary-container/80'
        }`}
      >
        <Moon className="w-3.5 h-3.5" /> Dark
      </button>
      <button
        type="button"
        onClick={() => onChange('light')}
        aria-pressed={theme === 'light'}
        className={`h-7 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors ${
          theme === 'light' ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-primary-container/80'
        }`}
      >
        <Sun className="w-3.5 h-3.5" /> Light
      </button>
    </div>
  );
}
