import { useTheme, type Theme } from '../providers/ThemeProvider.js';

type ThemeOption = {
  readonly value: Theme;
  readonly label: string;
};

const OPTIONS: readonly ThemeOption[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

/**
 * Compact button group for switching between light, dark, and system themes.
 *
 * Highlights the currently active mode and delegates to `setTheme` from
 * the ThemeProvider context.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex rounded-lg ring-1 ring-gray-700" role="group">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-pressed={theme === value}
          className={`px-3 py-1.5 text-xs font-medium first:rounded-l-lg last:rounded-r-lg ${
            theme === value
              ? 'bg-gray-700 text-white'
              : 'bg-gray-900 text-gray-400 hover:text-gray-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
