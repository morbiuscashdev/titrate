import { useTheme } from '../providers/ThemeProvider.js';

/** Sun icon for light mode. */
function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zm0 13a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zm5-5a.75.75 0 01.75.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0115 10zM2.75 9.25a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zM14.47 3.47a.75.75 0 011.06 0l.53.53a.75.75 0 01-1.06 1.06l-.53-.53a.75.75 0 010-1.06zM3.97 14.47a.75.75 0 011.06 0l.53.53a.75.75 0 01-1.06 1.06l-.53-.53a.75.75 0 010-1.06zM14.47 16.53a.75.75 0 010-1.06l.53-.53a.75.75 0 111.06 1.06l-.53.53a.75.75 0 01-1.06 0zM3.97 5.53a.75.75 0 010-1.06l.53-.53a.75.75 0 011.06 1.06l-.53.53a.75.75 0 01-1.06 0zM10 7a3 3 0 100 6 3 3 0 000-6z" />
    </svg>
  );
}

/** Moon icon for dark mode. */
function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clipRule="evenodd" />
    </svg>
  );
}

/** Monitor icon for system mode. */
function MonitorIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v8.5A2.25 2.25 0 0115.75 15h-3.105a3.501 3.501 0 001.1 1.677A.75.75 0 0113.26 18H6.74a.75.75 0 01-.484-1.323A3.501 3.501 0 007.355 15H4.25A2.25 2.25 0 012 12.75v-8.5zm1.5 0a.75.75 0 01.75-.75h11.5a.75.75 0 01.75.75v7.5a.75.75 0 01-.75.75H4.25a.75.75 0 01-.75-.75v-7.5z" clipRule="evenodd" />
    </svg>
  );
}

const active = 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white';
const inactive = 'bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200';

/**
 * Two-button theme toggle group.
 * Left button cycles light/dark, right button activates system mode.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const handleLightDarkClick = () => {
    if (theme === 'system') {
      // Switch from system to the opposite of what system resolved to
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    } else {
      setTheme(theme === 'dark' ? 'light' : 'dark');
    }
  };

  const isManual = theme === 'light' || theme === 'dark';
  const isSystem = theme === 'system';

  return (
    <div className="inline-flex rounded-lg ring-1 ring-gray-300 dark:ring-gray-700" role="group">
      <button
        type="button"
        onClick={handleLightDarkClick}
        aria-pressed={isManual}
        aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className={`rounded-l-lg px-2.5 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:z-10 ${isManual ? active : inactive}`}
      >
        {resolvedTheme === 'dark' ? <MoonIcon /> : <SunIcon />}
      </button>
      <button
        type="button"
        onClick={() => setTheme('system')}
        aria-pressed={isSystem}
        aria-label="Use system theme"
        className={`rounded-r-lg px-2.5 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:z-10 ${isSystem ? active : inactive}`}
      >
        <MonitorIcon />
      </button>
    </div>
  );
}
