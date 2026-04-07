import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const nodeShim = resolve(__dirname, 'src/shims/node-builtins.js');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Stub Node builtins imported by SDK distributor module (Node-only code
      // pulled in via the barrel export but never called in the browser).
      'node:fs': nodeShim,
      'node:path': nodeShim,
      'node:url': nodeShim,
      'node:crypto': nodeShim,
    },
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
