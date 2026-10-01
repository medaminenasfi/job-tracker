import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest mirrors the extension's existing test setup (vitest + jsdom), adapted
// for Next.js path aliases.
export default defineConfig({
  // Next.js keeps tsconfig `jsx: "preserve"`, which the oxc transform would
  // otherwise pass through untransformed — force the automatic runtime here.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
