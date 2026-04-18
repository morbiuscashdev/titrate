import { useTheme } from "../../theme";
import { Button } from "./Button";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  const glyph = theme === "dark" ? "◐" : "◑";
  return (
    <Button aria-label={label} onClick={toggle} variant="ghost" size="sm">
      <span aria-hidden className="font-mono">{glyph}</span>
    </Button>
  );
}
