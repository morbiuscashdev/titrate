import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Integration tests share a single Anvil instance — run files serially to avoid nonce conflicts
    fileParallelism: false,
  },
});
