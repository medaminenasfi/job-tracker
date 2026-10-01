import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    // Extension popups run in a separate extension world; these preload hints
    // trigger Opera/Chromium cross-world warnings and are not needed because
    // the popup bundle imports the modules normally.
    modulePreload: false,
  },
});
