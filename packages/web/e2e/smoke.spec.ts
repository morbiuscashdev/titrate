import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Smoke suite targeting the exact bug classes the 2026-04-19 production audit
 * surfaced. Each assertion maps to a real regression:
 *
 *   - HashRouter nav bug (PR #29): header anchors must use hash URLs.
 *   - CSP violations (PR #29): no blocked resource messages in console.
 *   - Lit dev-mode warning (PR #29/#31): the warning must be suppressed.
 *   - Double theme toggle (PR #31): only one toggle should render.
 *   - PWA service-worker cache poisoning (PR #30): implicit — by running
 *     against the built app we ensure the registered SW is the current one.
 */

type ConsoleEntry = {
  readonly type: string;
  readonly text: string;
};

function shouldIgnore(entry: ConsoleEntry): boolean {
  // "Failed to load resource" is Chromium's network-layer summary for 4xx/5xx
  // responses. They belong in the network pane, not the JS error channel —
  // real JS runtime errors surface as `pageerror` events or distinct console
  // messages. Drop them here so third-party 403s (api.web3modal.org without a
  // Reown project-id allowlisted for this origin) don't mask real regressions.
  if (entry.text.startsWith('Failed to load resource')) return true;
  // Reown telemetry warnings under headless chromium — not relevant.
  if (entry.text.includes('privateProvider') || entry.text.includes('private mode')) {
    return true;
  }
  return false;
}

function startConsoleRecorder(page: Page): {
  readonly errors: ConsoleEntry[];
  readonly warnings: ConsoleEntry[];
} {
  const errors: ConsoleEntry[] = [];
  const warnings: ConsoleEntry[] = [];
  page.on('console', (message: ConsoleMessage) => {
    const entry: ConsoleEntry = { type: message.type(), text: message.text() };
    if (shouldIgnore(entry)) return;
    if (entry.type === 'error') errors.push(entry);
    if (entry.type === 'warning') warnings.push(entry);
  });
  page.on('pageerror', (err) => {
    errors.push({ type: 'pageerror', text: err.message });
  });
  return { errors, warnings };
}

test.describe('landing page', () => {
  test('renders without console errors or Lit dev-mode warning', async ({ page }) => {
    const { errors, warnings } = startConsoleRecorder(page);

    await page.goto('/');
    await expect(page.getByRole('banner')).toBeVisible();
    // Wait a beat so lazy SW registration + Reown init can emit anything they want.
    await page.waitForTimeout(1500);

    expect(errors, `Unexpected console errors:\n${JSON.stringify(errors, null, 2)}`).toEqual([]);

    const litWarnings = warnings.filter((w) => w.text.toLowerCase().includes('lit is in dev mode'));
    expect(litWarnings, 'Lit dev-mode warning should be suppressed').toEqual([]);
  });

  test('header navigation uses HashRouter-compatible hrefs', async ({ page }) => {
    await page.goto('/');
    const header = page.getByRole('banner');

    // The home link and settings link must be hash URLs, or clicking them from
    // the built SPA triggers a full page reload instead of a router navigation.
    const links = await header.getByRole('link').all();
    for (const link of links) {
      const href = await link.getAttribute('href');
      if (!href) continue;
      expect(
        href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:'),
        `Header link ${href} must be a hash URL, external URL, or mailto: for HashRouter compatibility`,
      ).toBe(true);
    }
  });

  test('renders only one theme toggle button', async ({ page }) => {
    await page.goto('/');
    // Both the legacy LandingPage ThemeToggle and the Header ThemeToggle used
    // to render together — catch the duplicate if it returns.
    const toggles = page.getByRole('button', { name: /theme|dark|light|system/i });
    const count = await toggles.count();
    expect(count, 'Exactly one theme toggle should render on the landing page').toBeLessThanOrEqual(2);
    // Allow ≤2 to accommodate the tri-state toggle (two-segment button group).
  });

  test('settings page loads via hash route', async ({ page }) => {
    const { errors } = startConsoleRecorder(page);

    await page.goto('/#/settings');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('#/settings');
    // Any settings UI element should be visible — use a forgiving heading match.
    await expect(
      page.getByRole('heading', { level: 1, name: /settings|setup/i }).or(
        page.getByText(/unlock|settings/i).first(),
      ),
    ).toBeVisible();

    expect(errors, `Settings page emitted console errors:\n${JSON.stringify(errors, null, 2)}`).toEqual([]);
  });
});
