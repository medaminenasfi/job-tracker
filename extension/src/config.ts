// NestJS API base URL. The web app runs on :3001 and proxies /api to the
// backend on :3000; the extension talks to the backend directly.
export const API_BASE = 'http://localhost:3000/api';

// Web app origin used by the extension-login bridge.
export const WEB_ORIGIN = 'http://localhost:3001';
