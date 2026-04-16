# PWA Support — Design Spec

## Overview

Add Progressive Web App support to `@titrate/web` so the app can be installed and used offline. The data layer (IndexedDB) already handles persistence — this adds the missing app shell caching via a service worker and a web manifest for installability.

## Goals

1. **Offline-capable** — after first load, the app works without network (all HTML/JS/CSS cached by service worker)
2. **Installable** — users can install Titrate as a standalone app from the browser
3. **Prompt-to-update** — when a new version is deployed, a persistent banner prompts the user to refresh

## Approach

Use `vite-plugin-pwa` (Workbox-based) with `generateSW` strategy. No runtime caching — only the static app shell is cached. RPC calls and external API requests pass through to the network as normal.

## Icon

Replace the current `favicon.svg` (text-based "T") with a new SVG icon: a lowercase-t titration stand silhouette with a circle at the crossbar junction and a pointed tip at the bottom. Dark slate background (`#1e293b`), blue glyph (`#3b82f6`). No rounded corners.

Source SVG specification (viewBox 0 0 32 32):
- Background: `<rect width="32" height="32" fill="#1e293b"/>`
- Horizontal bar: full-width line at y=16, stroke-width 3.5, butt linecap
- Vertical bar: full-height line at x=16 from y=0 to y=26, stroke-width 3.5, butt linecap
- Point: triangle polygon from (14.25,26) to (17.75,26) to (16,29)
- Circle: cx=16 cy=16 r=5, fill=#1e293b (cutout), stroke=#3b82f6 stroke-width=2

The plugin auto-generates 192x192 and 512x512 PNGs from this SVG at build time.

## Plugin Configuration

In `vite.config.ts`, add `VitePWA` plugin with:

```typescript
VitePWA({
  registerType: 'prompt',
  strategies: 'generateSW',
  includeAssets: ['icon.svg'],
  manifest: {
    name: 'Titrate',
    short_name: 'Titrate',
    description: 'Distribute ERC-20 tokens to multiple recipients on any EVM chain',
    theme_color: '#1e293b',
    background_color: '#1e293b',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
  },
})
```

Key choices:
- `registerType: 'prompt'` — exposes `needRefresh` state instead of auto-updating
- `strategies: 'generateSW'` — Workbox auto-generates the service worker; no custom SW needed
- No `runtimeCaching` — RPC and external API calls should not be SW-cached
- `globPatterns` — caches all static build output for offline use

## CSP Update

Add `worker-src 'self'` to the Content-Security-Policy meta tag in `index.html` to allow service worker registration.

## Update Prompt Component

`ReloadPrompt.tsx` — a persistent banner that appears when a new service worker is waiting:

```typescript
import { useRegisterSW } from 'virtual:pwa-register/react';

export function ReloadPrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    // Fixed bottom banner with "New version available" + Refresh button
  );
}
```

Rendered inside `App.tsx` within the provider stack (after `ToastProvider` so it can layer above). This is NOT a toast — it's a persistent fixed-position banner that stays until the user clicks Refresh or dismisses it.

## index.html Updates

- Update `<link rel="icon">` to point to `icon.svg`
- Add `<meta name="theme-color" content="#1e293b">`
- Add `<link rel="apple-touch-icon" href="pwa-192x192.png">`
- CSP: add `worker-src 'self'`

## TypeScript Config

Add type reference for the virtual module in `tsconfig.json` or a `vite-env.d.ts`:

```typescript
/// <reference types="vite-plugin-pwa/client" />
```

## What Changes

| File | Change |
|------|--------|
| `packages/web/package.json` | Add `vite-plugin-pwa` dev dependency |
| `packages/web/vite.config.ts` | Add `VitePWA` plugin with config |
| `packages/web/public/icon.svg` | Replace favicon with titration stand icon |
| `packages/web/public/favicon.svg` | Delete (replaced by icon.svg) |
| `packages/web/index.html` | CSP update, icon link, theme-color meta, apple-touch-icon |
| `packages/web/src/components/ReloadPrompt.tsx` | New — persistent update banner |
| `packages/web/src/App.tsx` | Render `ReloadPrompt` |
| `packages/web/src/vite-env.d.ts` | Add PWA client type reference |

## What Stays

- IndexedDB storage — unchanged
- CacheProvider (memory + IDB request cache) — unchanged, orthogonal to SW cache
- All existing routes and components — unchanged
- No runtime caching of API/RPC calls — network-only for those

## Testing

- Build (`npm run build`) and verify `dist/` contains: `sw.js`, `manifest.webmanifest`, `pwa-192x192.png`, `pwa-512x512.png`
- `npm run preview` and check Chrome DevTools > Application > Service Workers (registered, active)
- Check Application > Manifest (correct name, icons, display mode)
- Go offline (DevTools > Network > Offline), reload — app loads from cache
- Deploy a change, reload — "New version available" banner appears
