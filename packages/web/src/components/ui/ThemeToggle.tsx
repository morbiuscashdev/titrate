import { useTheme } from "../../theme";

function SunGlyph() {
  return <span aria-hidden className="font-mono">◑</span>;
}
function MoonGlyph() {
  return <span aria-hidden className="font-mono">◐</span>;
}
function SystemGlyph() {
  return <span aria-hidden className="font-mono">⊙</span>;
}

const SEGMENT_BASE =
  "px-2 py-1 text-sm font-mono focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)] transition-colors";
const SEGMENT_ACTIVE = "bg-[color:var(--fg-primary)] text-[color:var(--bg-page)]";
const SEGMENT_INACTIVE =
  "text-[color:var(--fg-muted)] hover:text-[color:var(--fg-primary)]";

/**
 * Tri-state theme toggle: light / dark / system.
 *
 * Persists the user's preference. When "system" is selected, the resolved
 * theme follows the OS `prefers-color-scheme` and updates live.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const lightDarkLabel = resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  const lightDarkGlyph = resolvedTheme === "dark" ? <MoonGlyph /> : <SunGlyph />;
  const isManual = theme === "light" || theme === "dark";
  const isSystem = theme === "system";

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex border-2 border-[color:var(--edge)] bg-[color:var(--bg-card)]"
    >
      <button
        type="button"
        aria-label={lightDarkLabel}
        aria-pressed={isManual}
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className={`${SEGMENT_BASE} ${isManual ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
      >
        {lightDarkGlyph}
      </button>
      <button
        type="button"
        aria-label="Use system theme"
        aria-pressed={isSystem}
        onClick={() => setTheme("system")}
        className={`${SEGMENT_BASE} border-l-2 border-[color:var(--edge)] ${isSystem ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
      >
        <SystemGlyph />
      </button>
    </div>
  );
}
