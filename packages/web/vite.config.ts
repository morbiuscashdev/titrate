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
      registerType: 'prompt',
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
