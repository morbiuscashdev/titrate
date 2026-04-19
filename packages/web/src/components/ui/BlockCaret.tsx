/**
 * Blinking pink block caret for operator-A inputs. Paired with
 * `caret-color: transparent` on the input element so the native
 * thin caret is hidden and this block renders in its place.
 * Blink animation (CSS class `block-caret`) is defined in index.css
 * and frozen to solid under prefers-reduced-motion.
 */
export function BlockCaret() {
  return (
    <span
      data-testid="block-caret"
      aria-hidden="true"
      className="block-caret inline-block align-middle"
      style={{
        width: "0.6ch",
        height: "1em",
        background: "#d63384",
        marginLeft: "1px",
      }}
    />
  );
}
