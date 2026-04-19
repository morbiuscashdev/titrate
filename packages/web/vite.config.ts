import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const nodeShim = resolve(__dirname, 'src/shims/node-builtins.js');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
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
        // Don't precache HTML — index.html holds the CSP meta tag and must be
        // fetched fresh so deploys propagate without a cache-clear. Assets are
        // fingerprinted, so they're safe to precache for offline + speed.
        globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
        // No SPA precache fallback — navigation requests go through the
        // runtime handler below instead.
        navigateFallback: null,
        // NetworkFirst for navigations keeps the app usable offline while
        // always preferring fresh HTML when online.
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
        // Roll out the new SW immediately on every deploy instead of waiting
        // for tabs to close.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    // More-specific aliases must come first: 'node:fs' matches 'node:fs/promises'
    // as a prefix, so without listing 'node:fs/promises' above it, rollup tries
    // to resolve `node-builtins.js/promises` as a sub-path.
    alias: [
      { find: 'node:fs/promises', replacement: nodeShim },
      { find: 'node:readline/promises', replacement: nodeShim },
      { find: 'node:readline', replacement: nodeShim },
      { find: 'node:fs', replacement: nodeShim },
      { find: 'node:path', replacement: nodeShim },
      { find: 'node:url', replacement: nodeShim },
      { find: 'node:crypto', replacement: nodeShim },
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-viem': ['viem'],
          'vendor-wagmi': ['wagmi', '@tanstack/react-query'],
        },
      },
    },
  },
});
