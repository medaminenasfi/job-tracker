/// <reference types="vite/client" />
/// <reference types="@crxjs/vite-plugin/client" />

// Build-time overrides so a production bundle can point at the live backend
// without editing source (Phase 12). Set them in extension/.env.production.
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_WEB_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
