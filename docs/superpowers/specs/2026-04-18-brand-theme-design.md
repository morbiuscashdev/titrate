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
- A dark-mode variant of the brutalist marketing layer. Brutalist is light-only by design.
- A light-mode variant of the operator panels. Operator is dark-only by design.
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

The mark is the Unicode integral sign **∫ (U+222B)** rendered in pink-500 (`#d63384`). No custom SVG required — it's a single glyph that renders at 11px (TUI keybind label) through 200px (marketing hero) in IBM Plex Mono.

- **Rationale**: integration as continuous accumulation mirrors titration as continuous addition. Semantic match, visual match (tall narrow S-curve), and renders everywhere Plex Mono exists.
- **Sibling candidates** (not the default, but allowed for future iteration without a rebrand): **∮ (U+222E)** contour integral — has a built-in equivalence-point dot; **ʃ (U+0283)** IPA esh — smaller x-height form that can live inside the wordmark as `t·ʃ·trate`.
- **Wordmark**: ∫ rendered in pink-500, followed by the word `titrate` in IBM Plex Sans 800 at -0.02em letter-spacing. The mark and wordmark sit on the same baseline in navs; in heroes, the mark is 1.8× the wordmark's x-height.
- **Single-char slot** (CLI prompt, favicon if rendered as emoji, narrow contexts): ∫ alone in pink.
- **No lockup variants**, no tagline-baked logo, no wordmark-only version. The ∫ must always appear — it's the mark, the wordmark supplements it.

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
| `--pink-400` | `#f06ba3` | Operator accent (∫ mark, links, inline highlights) |
| `--pink-500` | `#d63384` | Primary CTA background, brutalist mark, focus color |
| `--pink-600` | `#b02473` | Primary CTA hover |

The 500 is the *one* brand color. 400 appears on dark surfaces where 500 would be too saturated against ink; 600 is the hover-darken.

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
- `primary`: pink-500 bg, white text, 6px radius, 1px transparent border. Hover: pink-600 bg.
- `secondary`: ink-800 bg, ink-100 text, ink-700 border. Hover: ink-700 bg, ink-500 border.
- `ghost`: transparent bg, ink-100 text. Hover: ink-800 bg.
- `danger`: transparent bg, err text, ink-700 border. Hover: `rgba(248,81,73,.1)` bg, err border.
- Sizes: `sm` 12/10px font, 4×10 padding. `md` 13/10px, 7×14. `lg` 14/10px, 10×18.
- Focus: info-blue 2px outline, 1px offset.

**Brutalist B**:
- `primary`: pink-500 bg, white text, 2px cream-900 border, 3px offset cream-900 shadow.
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
- Focus: pink-500 border + `0 0 0 3px rgba(214,51,132,.2)` glow (the one place pink wins over info-blue for focus, because inputs are where the brand "owns" the active field).
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

- **Operator A interactive chrome** (buttons, links, nav): 2px info-blue (`--info`) outline, 1px offset. Never remove; never replace without visible alternative.
- **Operator A form inputs**: 3px pink-500 soft glow (details in Inputs above). Distinguishes "I am editing this field" from "I am navigating this page."
- **Brutalist B**: shadow changes color from cream-900 to pink-500. Same 3px offset. The shadow-as-focus-ring is brutalist's signature.

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

- Favicon: render ∫ at 32×32 with a cream-50 background and 2px cream-900 border (a brutalist tile) as SVG, fall back to PNG. Inline `<link rel="icon">` in `index.html`.
- Marketing hero mark: ∫ in pink-500, Plex Mono 200/200, sitting in a cream-50 tile with a 3px cream-900 border and 6px offset shadow.
- Social card (OpenGraph): 1200×630, cream-50 background, ∫ + wordmark centered, one-liner below. Generated statically; not dynamic per-page.

## Open questions / deferred

1. **Accessibility audit**: palette has been chosen for aesthetic balance, not verified against WCAG AA across every token pair. Needs a pass before any public release — especially cream-700 on cream-100 (which is the brutalist muted-on-striped-row case).
2. **Dark-mode marketing**: explicitly out of scope. If we later need it (e.g., for a docs site that needs to match a user's system preference), it gets its own spec — not a retrofit of brutalist colors onto ink surfaces.
3. **Animation system**: button press-translate is defined. Other interactions (modal enter/exit, toast slide, skeleton loaders, panel expand/collapse) are undefined and should be decided per-feature for now. If a pattern emerges, upgrade to a separate motion spec.
4. **Component library testing**: visual regression (e.g., Chromatic) is not set up. Snapshot tests via Vitest + Testing Library are sufficient for MVP; visual regression is a follow-on if the component library stabilizes.
5. **TUI font**: we assume Plex Mono is available or the terminal's mono fallback is acceptable. If user reports render as "boxes" for the ∫, we'll need to detect and substitute a plain `S` prefix. Not worth solving preemptively.

## Out of scope for this spec

Any page-level design (campaign list layout, wizard step flow, settings IA). This spec defines the language; those designs are separate. When they happen they'll cite this doc rather than restate tokens.
