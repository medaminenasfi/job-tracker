import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// CRXJS-only build import ('./extractor?script' in popup.tsx). The `?script`
// query is meaningless outside the CRXJS plugin, so tests resolve it to a stub.
const stubPath = fileURLToPath(new URL('./src/extractor-script.stub.ts', import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: 'stub-crx-extractor-script',
      enforce: 'pre',
      resolveId(id: string) {
        if (/extractor(\.\w+)?\?script$/.test(id)) return stubPath;
        return null;
      },
    },
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
