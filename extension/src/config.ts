// NestJS API base URL. The web app runs on :3001 and proxies /api to the
// backend on :3000; the extension talks to the backend directly.
//
// Both values can be overridden at build time via VITE_API_BASE / VITE_WEB_ORIGIN
// (see .env.example) so a production bundle points at the live backend and web
// app without a source change. The localhost defaults keep `npm run dev`, the
// unit tests, and local `npm run build` working out of the box.
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000/api';

// Web app origin used by the extension-login bridge.
export const WEB_ORIGIN = import.meta.env.VITE_WEB_ORIGIN ?? 'http://localhost:3001';
