# Brand & Theme Design

**Status**: design complete, awaiting implementation plan
**Date**: 2026-04-18
**Supersedes**: nothing formally, but replaces ad-hoc styling in `packages/web/src/index.css` and OpenTUI color literals scattered across `packages/tui/src/`.

## Overview

Define one palette, one typography system, one mark, and two appearance modes — and the rule that decides which mode renders where. The brand is a dev tool for operators who want sovereignty over how they run airdrops; the theme has to carry that claim across a terminal TUI, a web GUI, and a marketing landing without feeling like three different products.

## Goals

1. **One visual system, two expressions.** A single palette, type scale, and mark. Two rendering modes — *operator A* (dark terminal) and *brutalist B* (light, hard-edged) — share that foundation.
2. **Mode-by-context, not mode-by-platform.** Which mode renders is determined by what the user is *doing*, not by which surface they're on:
   - **Decisions** (setup, summaries, settings, marketing) → brutalist B.
   - **Observation** (live pipelines, batch tables, logs, diagnostics, "the guts") → operator A.
   - **TUI** is pure operator A — there is no brutalist mode for a terminal.
3. **Min/max the extremes.** Brutalist pages commit to heavy borders, solid offset shadows, sharp edges, cream surfaces. Operator pages commit to dark ink, 1px borders, soft shadows, dense mono rows. Refuse halfway hybrids — the brand reads from the commitment, not the compromise.
4. **Single bridge between modes.** Shared across every surface: the ∫ mark, the pink-500 accent, IBM Plex Sans + Mono. Everything else (radius, shadow, border, card styling, button idiom) forks by mode.
5. **Cross-platform implementable.** Tailwind v4 CSS-first theme for web; a 256-color approximation table for TUI (OpenTUI).

## Non-goals

- Animation beyond the button press-translate in brutalist mode. No motion system yet.
- A light-mode variant of the operator panels. Operator is dark-only by design.
- A dark-mode variant of the TUI. The terminal is dark-only.
- Illustration style, custom iconography beyond the ∫ mark, or marketing photography direction.
- Accessibility beyond WCAG AA contrast verification on the chosen palette. Full AA+ audit is a follow-on.
- Localization of typography (CJK fallback stacks, RTL layout). Deferred.

## Positioning and copy

### One-liner

> **Titrate** — Sovereign airdrop tooling. Sign cold, run local, deploy anywhere.

Replaces the earlier **"offline-first airdrop platform"** which was factually wrong — you need an RPC node to reach the chain, so you can never be truly offline. What you *can* be is sovereign: no custodian, no intermediary, no trust required except the node you choose (and you can choose your own). The three verbs double as the brutalist hero chips.

### Voice

- **Direct and technical.** Write like a docs page, not a landing page. "Sign the EIP-712 message with your cold wallet" beats "Secure your assets."
- **Second person, active.** "You sign" / "You run" / "You deploy." Not "Titrate signs for you."
- **No scare-quotes, no excitement words.** Never "powerful", "seamless", "revolutionary". Ship-grade claims only.
- **Monospace for anything the user types or reads back** (addresses, commands, file paths, tx hashes, block numbers). Sans for narrative copy.

## Logo / mark

The mark is a **custom SVG titration curve** — angular `_/` path (flat low plateau, diagonal rise, flat high plateau) with a hollow equivalence-point circle at the inflection. Rendered in `pink-500` on light surfaces, `pink-400` on dark.

### Rationale

A real titration curve has three mandatory visual parts: the buffer region (flat bottom), the equivalence point (the rise with a marker on the inflection), and the post-equivalence plateau (flat top). No Unicode glyph captures this structure — `∫` is a compact stroke, `∮` includes a circle but the overall shape doesn't read as a curve. A small SVG asset gives total control over plateau length, rise steepness, circle radius, and stroke weight while staying crisp at any size.

### Geometry

```xml
<svg viewBox="0 0 170 150" xmlns="http://www.w3.org/2000/svg">
  <path d="M 14 120 L 65 120 L 95 30 L 156 30"
        stroke="currentColor" stroke-width="12"
        stroke-linecap="square" stroke-linejoin="miter" fill="none" />
  <circle cx="80" cy="75" r="22" fill="none"
          stroke="currentColor" stroke-width="8" />
</svg>
```

- `viewBox` 170×150 units; aspect ratio `~1.13:1`.
- Path: flat from `(14,120)` to `(65,120)` (low plateau), diagonal to `(95,30)` (steep rise), flat to `(156,30)` (high plateau). `stroke-linecap="square"` and `stroke-linejoin="miter"` preserve the crisp `_/` corners.
- Equivalence-point circle: center `(80,75)` on the diagonal midpoint, radius 22, stroke-width 8, no fill. Large hollow circle chosen specifically because it survives shrinking to nav-bar scale (~22px); smaller or filled variants close to a blob at that size.
- `currentColor` lets the containing element set the pink variant via `color: var(--pink-500)` on light surfaces or `color: var(--pink-400)` on dark.

### File locations

- `packages/web/public/mark.svg` — canonical asset, used inline in nav / hero components.
- `packages/web/public/favicon.svg` — 32×32 version with `cream-50` page-like background and 2px `cream-900` border (a brutalist tile) for browser tab.
- `packages/web/public/og-image.png` — 1200×630 social card rendered at build time from the SVG.

### Rendering fallbacks

The SVG can't render in a terminal. The mark therefore lives in three forms:

1. **Canonical SVG** — all web surfaces (brutalist light, brutalist dark, operator panels embedded in web).
2. **TUI single-glyph** — `∫` (U+222B) in Plex Mono or the terminal's mono fallback. Used in nav bars, single-line contexts, keybind labels.
3. **TUI splash (ASCII)** — three-line banner using `_/●` + wordmark, rendered at TUI startup:
   ```
            _____
           /
          ●
    _____/

    titrate   sovereign airdrop tooling
   ```

The mark is structurally the same across all three (flat plateau → rise → plateau + eq-point marker), just in different rendering idioms.

### Wordmark

SVG mark + `titrate` in IBM Plex Sans 800 at -0.02em letter-spacing.

- **In navs**: SVG at `38×32px` sits next to `titrate` at ~22px. Mark baseline aligns with wordmark baseline.
- **In heroes**: SVG at 150px (or larger), wordmark at 48px. Mark is ~3× the wordmark x-height. On brutalist surfaces, the SVG sits inside a `2px cream-900` bordered tile with `6px 6px 0` offset shadow (the marketing hero treatment).

### Lockup rules

- The mark must always appear with the wordmark — no solo wordmark ("titrate" alone).
- The wordmark may appear without the mark only in title-of-page contexts where the mark has already established brand within the same view (e.g., browser tab).
- No tagline-baked logo variants. The `sovereign airdrop tooling` tag is separate copy that can sit below the wordmark in heroes but is never locked into the mark.

## Mode assignment rule

### Authoritative rule

| Surface | Context | Mode |
|---|---|---|
| TUI | any | **Operator A** |
| Web | decision-making views | **Brutalist B** |
| Web | observational / runtime views | **Operator A** |

### What counts as "decision" vs "observation"

**Brutalist B (decisions)**:
- Landing page, marketing, documentation browsing
- Campaign list / overview cards
- New-campaign wizard, every step
- Cold-wallet signing and hot-wallet derivation flows
- Campaign drill-down header: summary cards (addresses / batches / gas / block)
- Settings (providers, API keys, storage paths)
- Finalize / confirm dialogs
- Export / download flows
- Empty states, onboarding, 404s

**Operator A (observation)**:
- Live pipeline view (scanner › filter › distributor panels)
- Batch table (pending / broadcast / included / reverted rows)
- Log streams (timestamped event feed)
- Address filter output
- Cursor / block progress displays
- Error diagnostics, stack traces, intervention prompts
- Wallet activity feed
- Raw transaction inspector
- Anything the user reads to understand what's *happening*

### The seam

In the web GUI, a page can (and usually does) contain both modes. Brutalist chrome wraps the page; operator panels embed inside.

**Seam rule**: an operator-A panel embedded inside brutalist chassis wears a **2px cream-900 border** and a **4px offset cream-900 shadow** — the brutalist frame *holds* the terminal the way a workbench holds a monitor. Operator-internal borders remain 1px ink-800; only the outer frame adopts the brutalist idiom.

Navigation, breadcrumb, page header, summary cards at the top of a drill-down, and the action bar at the bottom stay brutalist. The live pipeline / batch table / log stream in the middle is operator. No gradient transition, no visual fade — the seam is crisp.

## Color palette

All colors are defined as CSS custom properties in `packages/web/src/index.css`. Exact hex values below.

### Ink scale (dark neutrals — operator A surfaces)

| Token | Hex | Use |
|---|---|---|
| `--ink-950` | `#0b0d10` | Operator panel background |
| `--ink-900` | `#12151a` | Operator card / input background |
| `--ink-800` | `#1f2328` | Operator internal borders, secondary button background |
| `--ink-700` | `#30363d` | Operator hairline borders, disabled state |
| `--ink-500` | `#7d8590` | Operator muted text, labels |
| `--ink-100` | `#e6edf3` | Operator primary text |

### Cream scale (light neutrals — brutalist B surfaces)

| Token | Hex | Use |
|---|---|---|
| `--cream-50` | `#fefce8` | Brutalist page background |
| `--cream-100` | `#faf7dd` | Brutalist secondary-button / subtle-fill |
| `--cream-200` | `#f5f0c2` | Brutalist mode-label chip |
| `--cream-700` | `#555555` | Brutalist muted text |
| `--cream-900` | `#171717` | Brutalist primary text, all brutalist borders and shadows |

### Titration (brand accent — both modes)

| Token | Hex | Use |
|---|---|---|
| `--pink-400` | `#f06ba3` | Operator accent (∫ mark on dark, inline highlights, tx hashes, addresses) |
| `--pink-500` | `#d63384` | Brand mark (∫ on light surfaces), focus-ring shadow, non-text accents only |
| `--pink-600` | `#b02473` | Primary CTA background, inline accents on light surfaces, text-role pink |
| `--pink-700` | `#8c1a5b` | Primary CTA hover |

The 500 is the *one* brand color — it owns the mark. But it measures **4.48:1** against white, which fails WCAG AA for normal text. So text-on-pink (button labels, inline accents on light surfaces) uses 600 (**6.14:1**, AA clear) and the hover-darken becomes 700 (**8.66:1**). Role split:

- **Non-text pink** (∫ mark at any size, input focus-ring shadow, graphical-object usages): `pink-500`. All pass the 3:1 UI threshold.
- **Text-on-pink fills** (button labels, pill backgrounds where text sits on pink): `pink-600`. Passes 4.5:1.
- **Pink as text on light** (inline `0x…` snippets, highlighted labels): `pink-600`. Passes 4.5:1 against cream-50 / white.
- **Pink as text on dark**: `pink-400` (passes 6.92:1 against ink-950).

This split lets us claim WCAG AA compliance on every text pairing in the spec.

### Semantic (operator A only)

| Token | Hex | Use |
|---|---|---|
| `--ok` | `#3fb950` | running / included / success |
| `--warn` | `#d29922` | paused / slow |
| `--err` | `#f85149` | reverted / error / destructive action |
| `--info` | `#58a6ff` | pending / focus-ring for non-input chrome |

Borrowed from GitHub primer for readability against ink surfaces. Do not use these in brutalist B — brutalist uses status chips (below) instead.

### Brutalist chips (B only)

| Token | Hex | Use |
|---|---|---|
| `--chip-yellow` | `#facc15` | "Sign cold" verb chip, warn pill |
| `--chip-green` | `#86efac` | "Run local" verb chip, ok pill |
| `--chip-pink` | `#fda4af` | "Deploy anywhere" verb chip, err pill |

Used exclusively on brutalist pill backgrounds (2px cream-900 border wraps them). Never on operator A surfaces.

## Dark brutalist (marketing dark mode)

Brutalist has two surface variants: the default **light brutalist** (cream surfaces) and a **dark brutalist** that honors `prefers-color-scheme: dark` (or a manual toggle). This is a variant, not a new mode — same layouts, same components, same offset-shadow idioms, same typography. Only the surface tokens invert.

### Token inversion

| Role | Light brutalist | Dark brutalist |
|---|---|---|
| Page background | `cream-50` `#fefce8` | `ink-950` `#0b0d10` |
| Card background | `white` `#ffffff` | `ink-900` `#12151a` |
| Primary text | `cream-900` `#171717` | `ink-100` `#e6edf3` |
| Muted text | `cream-700` `#555555` | `ink-500` `#7d8590` |
| Border color (2px & 3px) | `cream-900` | `ink-100` |
| Offset shadow color | `cream-900` | `ink-100` |
| Primary CTA background | `pink-600` (unchanged — passes AA on both) |
| Primary CTA hover | `pink-700` (unchanged) |
| Verb chip backgrounds | `chip-yellow` / `chip-green` / `chip-pink` (unchanged) |
| Verb chip text | `cream-900` (unchanged) |
| Verb chip border | `cream-900` 2px | `ink-100` 2px |
| Inline text accent (addresses, block numbers) | `pink-600` (4.5:1 on cream) | `pink-400` (6.9:1 on ink) |
| Focus shadow color | `pink-500` (unchanged — passes 3:1 on both) |

### Implementation

Dark brutalist is opt-in via OS preference or a manual toggle stored in `localStorage`. The `data-theme` attribute on the document root selects the active variant:

```css
[data-theme="light"] {
  --bg-page: var(--color-cream-50);
  --bg-card: white;
  --fg-primary: var(--color-cream-900);
  --fg-muted: var(--color-cream-700);
  --edge: var(--color-cream-900);
  --shadow-color: var(--color-cream-900);
  --accent-inline: var(--color-pink-600);
  --mark-color: var(--color-pink-500);
}

[data-theme="dark"] {
  --bg-page: var(--color-ink-950);
  --bg-card: var(--color-ink-900);
  --fg-primary: var(--color-ink-100);
  --fg-muted: var(--color-ink-500);
  --edge: var(--color-ink-100);
  --shadow-color: var(--color-ink-100);
  --accent-inline: var(--color-pink-400);
  --mark-color: var(--color-pink-400);
}

/* Default to OS preference if no explicit theme is set */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    /* use the dark values above */
  }
}
```

A tiny inline script in `index.html` runs before React hydrates and sets `document.documentElement.dataset.theme` based on `localStorage['theme']` (explicit user choice) or `matchMedia('(prefers-color-scheme: dark)').matches` (OS fallback). Prevents flash of wrong theme on page load.

### What does NOT gain a dark variant

- **Operator A** stays dark-only. No light-mode operator panel. The min/max principle — operator is the dark workbench, period.
- **TUI** stays dark-only.
- **Semantic colors** (`ok`, `warn`, `err`, `info`) don't change between brutalist light/dark — they're operator-layer tokens that only appear inside embedded operator panels, which are always dark.

### Seam rule in dark brutalist

Operator-A panels embedded inside a dark-brutalist chassis use a **2px `ink-100` outer border** + **4px `ink-100` offset shadow** (mirrors the `cream-900` framing rule from light brutalist). Panel interior stays `ink-950` bg as always — the operator mode doesn't care which brutalist variant wraps it.

## Typography

IBM Plex Sans and IBM Plex Mono — same designer (Mike Abbink / Bold Monday), aligned metrics, open font license. Loaded from Google Fonts on web; shipped as file assets on TUI via the terminal's font (Plex Mono is widely available in modern terminals; if the user's terminal doesn't have it, `ui-monospace` / `Menlo` fallback is acceptable).

### Scale

| Token | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `--type-display` | 56 / 60 | 800 | -0.03em | Hero heading |
| `--type-h1` | 32 / 36 | 800 | -0.02em | Page heading |
| `--type-h2` | 22 / 28 | 700 | -0.01em | Section heading |
| `--type-h3` | 16 / 22 | 600 | 0 | Card title |
| `--type-body` | 14 / 22 | 400 | 0 | Body copy |
| `--type-small` | 12 / 18 | 400 | 0 | Secondary copy |
| `--type-label` | 11 / 14 | 500 | 0.15em uppercase | Labels, nav items |

### Mono scale

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `--type-mono-display` | 28 / 32 | 500 | Marketing hero ∫ mark inline |
| `--type-mono-body` | 13 / 20 | 400 | Operator data rows, logs, addresses |
| `--type-mono-label` | 11 / 14 | 500 | Operator labels, keybind captions |

### Usage rules

- **Sans** — all narrative copy, headings, buttons, card titles, descriptions.
- **Mono** — all machine-readable text (addresses, tx hashes, block numbers, commands, file paths, log lines) *and* all brutalist labels (to keep brutalist typography 100% Plex Mono for label/chip text).
- **Uppercase labels** — Plex Mono 11/14 at 0.15em letter-spacing. Used for nav items in brutalist, section dividers in operator, form labels in both.
- **Never mix weights within a single paragraph**. Bold for emphasis is fine inline; font-weight shifts within a single sentence are not.

## Motion

Motion is tightly scoped — a dev tool for sovereignty-minded operators should feel calm and deliberate, not playful. Six total primitives, three durations, three easings. No parallax, no spring physics, no scroll-reveal, no stagger. If a use case emerges that needs something beyond this catalog, it's a spec amendment.

### Tokens

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 80ms | Focus-gain, caret blink, small state swaps |
| `--duration-base` | 150ms | Button press, toast/modal enter, panel expand |
| `--duration-slow` | 240ms | Marketing hero enter (rare — used sparingly) |
| `--ease-out-standard` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default; virtually everything operator |
| `--ease-out-snap` | `cubic-bezier(0, 0.55, 0.45, 1)` | Brutalist button press-translate only |
| `--ease-linear` | `linear` | Skeleton shimmer, caret blink |

### Catalog

Every animation in the product must be one of these six. Anything else is a spec violation.

1. **Button hover (brutalist)** — translate `(1px, 1px)`, shadow shrinks 3→2px. `duration-fast` `ease-out-snap`.
2. **Button press (brutalist)** — translate `(3px, 3px)`, shadow collapses 3→0. `duration-fast` `ease-out-snap`. On release, reverses to hover state.
3. **Focus gain (any focusable element)** — box-shadow / outline color transition. `duration-fast` `ease-out-standard`. Applies to both operator and brutalist focus treatments.
4. **Modal / drawer enter** — opacity `0→1` + translate-up 4px. `duration-base` `ease-out-standard`. Exit reverses with opacity only (no downward translate — avoids dismissal feeling like a fall).
5. **Toast slide** — translate from nearest edge (top-right for ok/info, bottom-center for err) + opacity `0→1`. `duration-base` `ease-out-standard`. Auto-dismiss at 4s unless toast type is `err` (persistent until manually dismissed).
6. **Skeleton shimmer (operator-only)** — background-position linear gradient loop across a translucent ink-800 → ink-700 → ink-800 stripe. 1200ms `ease-linear` infinite. Used for batch-table and log-stream data-loading placeholders. Never used in brutalist chassis (brutalist shows static "loading…" label instead).

### Block caret (special case)

The operator-A input's terminal block caret blinks at 1Hz via a pure CSS `steps(2)` animation:

```css
@keyframes caret-blink { 0%, 50% { opacity: 1 } 51%, 100% { opacity: 0 } }
.block-caret { animation: caret-blink 1s steps(2, end) infinite; }
```

This is a decorative-but-informative animation (signals "cursor position is here") — treated as essential for focus feedback but non-essential as *motion*. The reduced-motion rule (below) turns blink into solid.

### Reduced motion (`prefers-reduced-motion: reduce`)

The rule: **keep essential motion; cut decorative and looping motion**. Users with vestibular sensitivities should still understand the interface, but nothing should trigger motion sickness or cognitive load.

**Preserved under reduced-motion:**
- Focus-gain transitions (color changes — users need to know what's focused).
- Modal / toast opacity fade (so elements don't appear out of thin air, which is disorienting).
- Color transitions on hover / state change (convey meaning).

**Modified under reduced-motion:**
- Button press-translate → **removed** (translate and shadow-shift dropped; the pink-500 → pink-700 color change alone signals the press).
- Modal / drawer translate-up component → **removed** (opacity fade only, no movement).
- Toast slide → **removed** (opacity fade only; toast appears in place).
- Skeleton shimmer → **static** (infinite loop stops; gradient freezes at its middle frame, no motion).
- Block caret blink → **solid** (pink block stays visible continuously; cursor still marks position but does not blink).

**Durations unchanged** under reduced-motion — slow fades aren't the problem; transforms and infinite loops are.

### Off-limits (will not ship without a spec amendment)

- Parallax scroll effects
- Scroll-triggered reveal animations
- Spring / bounce physics (overshoot, settle)
- Stagger-cascade entry animations
- Entrance animations triggered by viewport intersection
- Any animation over 300ms (including `duration-slow` which caps at 240ms)
- Auto-playing video / marquee / carousel

## Tokens

Design tokens are defined per mode. Both token sets ship as CSS custom properties; Tailwind v4 theme layer maps them into utility classes.

### Radius

| Token | Operator A | Brutalist B |
|---|---|---|
| `--radius-sm` | 4px | 0px |
| `--radius-md` | 6px | 0px |
| `--radius-lg` | 8px | 0px |
| `--radius-xl` | 12px | 2px |
| `--radius-pill` | 999px | 999px |

Brutalist commits to sharp edges. Only pill-shaped chips get rounded (they read as stickers, not buttons). Operator uses the GitHub-primer radius progression.

### Spacing (4px grid, shared)

| Token | Value |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-12` | 48px |

Spacing tokens are mode-agnostic.

### Shadow

| Token | Operator A | Brutalist B |
|---|---|---|
| `--shadow-sm` | `0 1px 0 rgba(0,0,0,.3)` | `2px 2px 0 var(--cream-900)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,.4)` | `4px 4px 0 var(--cream-900)` |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,.5)` | `6px 6px 0 var(--cream-900)` |

Operator uses soft blurs. Brutalist uses offset solid shadows (never blurs). Pressed brutalist elements translate `(N, N)` and shrink shadow to `max(0, N-2)`; the element appears to move under its own shadow.

### Border

| Token | Operator A | Brutalist B |
|---|---|---|
| `--border-width` | 1px | 2px |
| `--border-heavy` | 1px | 3px |
| `--border-color` | `var(--ink-700)` | `var(--cream-900)` |

## Components

Every component ships in both modes. Files colocate: `packages/web/src/components/ui/Button.tsx` exports a base `Button` that reads mode from a `data-mode="brutalist"` ancestor (brutalist chassis wraps with `data-mode`, operator panels reset with `data-mode="operator"`). Tailwind v4 utilities resolve tokens per mode.

### Buttons

**Operator A**:
- `primary`: pink-600 bg, white text, 6px radius, 1px transparent border. Hover: pink-700 bg.
- `secondary`: ink-800 bg, ink-100 text, ink-700 border. Hover: ink-700 bg, ink-500 border.
- `ghost`: transparent bg, ink-100 text. Hover: ink-800 bg.
- `danger`: transparent bg, err text, ink-700 border. Hover: `rgba(248,81,73,.1)` bg, err border.
- Sizes: `sm` 12/10px font, 4×10 padding. `md` 13/10px, 7×14. `lg` 14/10px, 10×18.
- Focus: info-blue 2px outline, 1px offset.

**Brutalist B**:
- `primary`: pink-600 bg, white text, 2px cream-900 border, 3px offset cream-900 shadow. Pressed: hover pink-700.
- `secondary`: cream-100 bg, cream-900 text, 2px cream-900 border, 3px offset shadow.
- `ghost`: cream-50 bg, cream-900 text, 2px cream-900 border, 3px offset shadow.
- Sizes: `sm` 11/10px font, 4×10 padding, 2px offset shadow. `md` 14/10px, 10×18, 3px offset shadow.
- Hover: translate `(1px, 1px)`, shadow shrinks to 2px.
- Pressed: translate `(3px, 3px)`, shadow collapses to 0.
- Focus: shadow changes color from cream-900 to pink-500 (same offset).

### Form inputs

**Operator A**:
- Text / select / textarea: ink-900 bg, ink-100 text, ink-700 1px border, 6px radius, 7×12 padding.
- Placeholder: ink-500.
- Focus: `box-shadow: 0 0 0 3px var(--pink-500)` solid outset (border color unchanged). Box-shadow doesn't reflow the input; border stays ink-700 at all states. This is the one place the focus indicator is pink — inputs are where the brand "owns" the active field. Contrast `pink-500`/`ink-950` = **4.32:1**, passes WCAG 2.1 AA 1.4.11 Non-text Contrast (≥3:1).
- **Block caret**: when focused, the default thin caret is replaced by a `pink-500` solid block (roughly `0.6ch × line-height`) that blinks at 1Hz (500ms on / 500ms off). Reads as a terminal cursor. Implementation: custom React input hides the native caret (`caret-color: transparent`) and renders an absolutely-positioned block element at the insertion point; fallback for textarea/contenteditable or environments where cursor tracking is unreliable is plain `caret-color: var(--pink-500)` (native caret, pink-colored).
- Checkbox accent-color: pink-500.

**Brutalist B**:
- Text / select / textarea: white bg, cream-900 text, 2px cream-900 border, 0 radius, 3px offset cream-900 shadow, 8×12 padding, mono font (Plex Mono 13/20).
- Placeholder: cream-700.
- Focus: shadow + border change color to pink-500 (identical geometry).
- Labels always sit above inputs in `label-` mono style.

### Cards

**Operator A**:
- Campaign / wallet / entity cards: ink-900 bg, ink-800 1px border, 8px radius, 16px padding.
- Title: Plex Sans 14/22 weight-600 ink-100.
- Description: Plex Mono 12/18 ink-500.
- Badges inside cards use operator-A status pills (below).

**Brutalist B**:
- Landing hero / verb / summary cards: white bg, 2px cream-900 border, 0 radius, 4px offset cream-900 shadow, 18px padding.
- Title: Plex Sans 17/22 weight-800 cream-900, -0.01em tracking.
- Description: Plex Mono 12/18 cream-700.
- Large-stat cards (batch count, gas spent): display number in Plex Sans 28/30 weight-800 cream-900; label in mono-label style above it.

### Badges / pills

**Operator A status pills** (used in cards, tables, nav):
- Geometry: pill 999px radius, 1px border, 2×8 padding, Plex Mono 11/14 weight-500.
- `ok`: `rgba(63,185,80,.1)` bg, ok text, `rgba(63,185,80,.3)` border. Leading 6px ok dot.
- `warn`: same geometry, warn color family.
- `err`: err color family.
- `info`: info color family.
- `neutral`: ink-800 bg, ink-100 text, ink-700 border, no dot.

**Brutalist B status pills**:
- Geometry: 0 radius, 2px cream-900 border, 3×8 padding, Plex Mono 11/14 weight-700 uppercase 0.1em tracking.
- `ok`: chip-green bg. Leading 6px cream-900 dot.
- `warn`: chip-yellow bg.
- `err`: chip-pink bg.
- `info`: white bg.

**Brutalist verb chips** (hero and landing only):
- "Sign cold" chip-yellow, "Run local" chip-green, "Deploy anywhere" chip-pink.
- Same geometry as brutalist status pills but 12/14 Plex Mono weight-700.

### Data tables

**Operator A** (default for observational views):
- No outer border. 1px ink-800 divider under header row.
- Header: Plex Mono 10/14 weight-500 ink-500 uppercase 0.12em tracking.
- Body rows: Plex Mono 12/18 ink-100. No row borders; rows separate by padding (4px top/bottom).
- Status cell: leading `•` dot + semantic-color text (no pill background, keep density high).
- Hover: `rgba(125,133,144,.08)` row background.

**Brutalist B** (used only when the table is itself a decision artifact — e.g., selecting wallets, export preview):
- Outer 2px cream-900 border, 4px offset shadow.
- Header row: cream-900 bg, cream-50 text, Plex Mono 10/14 weight-700 uppercase 0.15em tracking, 10×12 padding.
- Body rows: white bg, Plex Mono 13 cream-900, 9×12 padding, 1px cream-900 divider under each row.
- Alternate row stripe: cream-100.
- Status cell: brutalist pill inline.

### Focus states

- **Operator A interactive chrome** (buttons, links, nav): 2px info-blue (`--info`) outline, 1px offset. Contrast `info`/`ink-950` = **7.74:1**. Never remove; never replace without visible alternative.
- **Operator A form inputs**: 3px solid pink-500 outset box-shadow (no border change) + pink-500 blinking block caret. Distinguishes "I am editing this field" from "I am navigating this page."
- **Brutalist B**: shadow changes color from cream-900 to pink-500. Same 3px offset. Contrast `pink-500`/`cream-50` = **4.34:1**. The shadow-as-focus-ring is brutalist's signature.

Tab order follows DOM order; skip-link at top of web pages navigates straight to the main panel.

## TUI parity (OpenTUI color mapping)

TUI can't render brutalist (no offset shadows, no variable border widths in a terminal). It renders pure operator A using ANSI-256 approximations:

| Token | ANSI-256 approx | Hex |
|---|---|---|
| `--ink-950` | 232 (`#080808`) | closest to `#0b0d10` |
| `--ink-900` | 234 (`#1c1c1c`) | |
| `--ink-800` | 236 (`#303030`) | |
| `--ink-700` | 238 (`#444444`) | |
| `--ink-500` | 244 (`#808080`) | |
| `--ink-100` | 252 (`#d0d0d0`) | |
| `--pink-400` | 205 (`#ff5fd7`) | bright pink for dark bg |
| `--pink-500` | 169 (`#d75faf`) | brand pink |
| `--ok` | 71 (`#5faf5f`) | |
| `--warn` | 178 (`#d7af00`) | |
| `--err` | 203 (`#ff5f5f`) | |
| `--info` | 75 (`#5fafff`) | |

These live in `packages/tui/src/theme/colors.ts` as a typed constant map. OpenTUI color props reference this map; no inline hex in components.

The ∫ mark renders at its native Unicode code point (U+222B) in Plex Mono or the terminal's fallback mono. The wordmark uses the terminal's default sans fallback; visual fidelity is secondary in the TUI because character width is non-negotiable.

## Implementation notes

### Web — Tailwind v4 theme

In `packages/web/src/index.css`:

```css
@import "tailwindcss";

@theme {
  /* Ink scale */
  --color-ink-950: #0b0d10;
  --color-ink-900: #12151a;
  --color-ink-800: #1f2328;
  --color-ink-700: #30363d;
  --color-ink-500: #7d8590;
  --color-ink-100: #e6edf3;

  /* Cream scale */
  --color-cream-50: #fefce8;
  --color-cream-100: #faf7dd;
  --color-cream-200: #f5f0c2;
  --color-cream-700: #555555;
  --color-cream-900: #171717;

  /* Brand */
  --color-pink-400: #f06ba3;
  --color-pink-500: #d63384;
  --color-pink-600: #b02473;
  --color-pink-700: #8c1a5b;

  /* Semantic */
  --color-ok: #3fb950;
  --color-warn: #d29922;
  --color-err: #f85149;
  --color-info: #58a6ff;

  /* Chips */
  --color-chip-yellow: #facc15;
  --color-chip-green: #86efac;
  --color-chip-pink: #fda4af;

  /* Font families */
  --font-sans: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;

  /* Motion */
  --duration-fast: 80ms;
  --duration-base: 150ms;
  --duration-slow: 240ms;
  --ease-out-standard: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-out-snap: cubic-bezier(0, 0.55, 0.45, 1);
  --ease-linear: linear;
}

/* Reduced-motion overrides — see Motion § Reduced motion */
@media (prefers-reduced-motion: reduce) {
  /* Transforms and infinite loops become static; fades and color transitions preserved */
  [data-motion="press-translate"] { transform: none !important; }
  [data-motion="modal-translate"] { transform: none !important; }
  [data-motion="toast-slide"] { transform: none !important; }
  [data-motion="skeleton-shimmer"] { animation: none !important; background-position: 50% 50% !important; }
  .block-caret { animation: none !important; opacity: 1 !important; }
}

/* Brutalist light/dark surface tokens (honor OS preference unless overridden) */
[data-theme="light"] {
  --bg-page: var(--color-cream-50);
  --bg-card: #ffffff;
  --fg-primary: var(--color-cream-900);
  --fg-muted: var(--color-cream-700);
  --edge: var(--color-cream-900);
  --shadow-color: var(--color-cream-900);
  --accent-inline: var(--color-pink-600);
  --mark-color: var(--color-pink-500);
}
[data-theme="dark"] {
  --bg-page: var(--color-ink-950);
  --bg-card: var(--color-ink-900);
  --fg-primary: var(--color-ink-100);
  --fg-muted: var(--color-ink-500);
  --edge: var(--color-ink-100);
  --shadow-color: var(--color-ink-100);
  --accent-inline: var(--color-pink-400);
  --mark-color: var(--color-pink-400);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --bg-page: var(--color-ink-950);
    --bg-card: var(--color-ink-900);
    --fg-primary: var(--color-ink-100);
    --fg-muted: var(--color-ink-500);
    --edge: var(--color-ink-100);
    --shadow-color: var(--color-ink-100);
    --accent-inline: var(--color-pink-400);
    --mark-color: var(--color-pink-400);
  }
}

/* Mode tokens scoped to data-mode ancestors */
[data-mode="brutalist"] {
  --radius-sm: 0; --radius-md: 0; --radius-lg: 0; --radius-xl: 2px; --radius-pill: 9999px;
  --shadow-sm: 2px 2px 0 var(--color-cream-900);
  --shadow-md: 4px 4px 0 var(--color-cream-900);
  --shadow-lg: 6px 6px 0 var(--color-cream-900);
  --border-width: 2px; --border-heavy: 3px; --border-color: var(--color-cream-900);
}
[data-mode="operator"] {
  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px; --radius-xl: 12px; --radius-pill: 9999px;
  --shadow-sm: 0 1px 0 rgba(0,0,0,.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,.4);
  --shadow-lg: 0 8px 24px rgba(0,0,0,.5);
  --border-width: 1px; --border-heavy: 1px; --border-color: var(--color-ink-700);
}
```

Google Fonts `<link>` goes in `packages/web/index.html`. Weights loaded: Sans 400/500/600/700/800, Mono 400/500/600/700.

### Component library surface

New directory `packages/web/src/components/ui/`:

- `Button.tsx` — reads `data-mode` ancestor, renders appropriate variant.
- `Input.tsx`, `Textarea.tsx`, `Select.tsx`, `Checkbox.tsx` — same pattern.
- `Card.tsx`, `StatCard.tsx` — brutalist-only summary cards vs operator-only entity cards; one file, branch on mode.
- `Pill.tsx` — status pill, auto-branches.
- `Chip.tsx` — brutalist verb chip, single-mode (no-op in operator context).
- `DataTable.tsx` — takes `mode="operator" | "brutalist"` prop; defaults to `operator` (the common case).
- `OperatorPanel.tsx` — wrapper that renders a dark ink surface with brutalist outer frame; use inside brutalist chrome to embed operator views.
- `AppShell.tsx` — top-level brutalist chrome (nav, page body wrapper, footer).

Every component imports from `@/components/ui`. Page-level files (`CampaignList.tsx`, `CampaignDetail.tsx`, `WalletSetup.tsx`, etc.) wrap in either `<div data-mode="brutalist">` or `<OperatorPanel>` and compose from the library.

### TUI parity

- `packages/tui/src/theme/colors.ts` — typed constant map of ANSI-256 values (see TUI parity table).
- `packages/tui/src/theme/index.ts` — re-exports plus a `symbols` map with `mark: "\u222B"`, `dot: "•"`, `check: "✓"`, `cross: "✗"`.
- Existing OpenTUI-using screens (`Dashboard.tsx`, `CampaignSetup.tsx`, etc.) migrate from inline hex to theme-imported constants. No runtime change; just referential.

### Favicon and logo assets

- **Favicon**: the canonical `mark.svg` (titration curve + hollow eq-point circle) placed inside a cream-50 tile with a 2px cream-900 border — a brutalist mini-poster. Served at 32×32, plus a PNG fallback for browsers without SVG favicon support. Inlined via `<link rel="icon" type="image/svg+xml" href="/mark-tile.svg">` + `<link rel="icon" type="image/png" href="/mark-tile.png" sizes="32x32">`.
- **Marketing hero mark**: `mark.svg` at 150px (or larger) in `pink-500` (light) or `pink-400` (dark), inside a cream-50 / ink-900 tile with `border-heavy` (3px) and `6px 6px 0` offset shadow.
- **Social card (OpenGraph)**: 1200×630, `mark.svg` + wordmark centered, one-liner below. Generated statically at build time from the SVG and the one-liner text. Light variant only — social previews in link cards don't respect user OS preference.

## Open questions / deferred

1. **Accessibility audit**: ~~palette has been chosen for aesthetic balance, not verified against WCAG AA~~. **Resolved 2026-04-18**: contrast measured across every token pair. Operator A clean throughout (ink-100/ink-950 16.4:1, ink-500/ink-900 5.00:1, all semantic colors 5.5–7.5:1). Brutalist B clean (cream-900/cream-50 17.3:1, cream-700/cream-100 muted-on-striped 6.93:1, all chip backgrounds 9.5–12.7:1). Only failure was `white on pink-500` at 4.48:1 for button-label use; resolved by promoting `pink-600` (6.14:1) to text-on-fill duty and adding `pink-700` (8.66:1) for hover. The role split is described in the Color Palette section. We can claim WCAG AA on every text pairing in the spec.
2. **Dark-mode marketing**: ~~explicitly out of scope~~. **Resolved 2026-04-18**: in scope. Shipped as the "Dark brutalist" surface variant — see the Dark brutalist section above. Honors `prefers-color-scheme: dark` + a manual toggle stored in `localStorage`. Operator-A and TUI remain dark-only; only brutalist gains a light/dark pair.
3. **Animation system**: ~~button press-translate is defined~~. **Resolved 2026-04-18**: full Motion section added covering 3 durations, 3 easings, and a 6-primitive catalog (button hover, button press, focus gain, modal enter, toast slide, skeleton shimmer). Block-caret blink specified as a special case. Reduced-motion rule keeps essential transitions (focus, fade, color change) and cuts decorative ones (translate, infinite loops, blink). Off-limits list prevents drift. See the Motion section.
4. **Component library testing**: ~~visual regression (e.g., Chromatic) is not set up~~. **Resolved 2026-04-18**: deferred. Snapshot tests via Vitest + Testing Library are sufficient for MVP. Visual regression becomes worthwhile once the library has ~15–20 stable components where human review can no longer reliably catch regressions; revisit at that point with its own spec.
5. **TUI font**: ~~we assume Plex Mono is available or the terminal's mono fallback is acceptable~~. **Resolved 2026-04-18**: not worth preemptive detection. The TUI splash uses a three-line ASCII `_/●` banner (no glyph dependency) and inline contexts fall back to the Unicode `∫` (U+222B, widely supported). If a user reports either as a tofu box we add a runtime detection + plain-`S` substitution at that point.

## Out of scope for this spec

Any page-level design (campaign list layout, wizard step flow, settings IA). This spec defines the language; those designs are separate. When they happen they'll cite this doc rather than restate tokens.
