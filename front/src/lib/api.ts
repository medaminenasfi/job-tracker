// Same-origin client: next.config.mjs rewrites /api/* to the Nest backend so the
// httpOnly refresh cookies are stored on the web origin (required for middleware).
//
// Two independent sessions are supported. Calls under /api/admin/* use the admin
// access token + adminRefreshToken cookie; everything else uses the user token +
// refreshToken cookie. This lets a normal user stay logged into /dashboard while
// an admin is logged into /admin, without one clobbering the other.

export type TokenScope = 'user' | 'admin';

const accessTokens: Record<TokenScope, string | null> = {
  user: null,
  admin: null,
};

export function setAccessToken(token: string | null, scope: TokenScope = 'user') {
  accessTokens[scope] = token;
}

export function getAccessToken(scope: TokenScope = 'user') {
  return accessTokens[scope];
}

function scopeFor(path: string): TokenScope {
  return path.startsWith('/api/admin') ? 'admin' : 'user';
}

// Auth endpoints must never trigger a refresh-retry loop.
const AUTH_ENDPOINTS = new Set([
  '/api/auth/refresh',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/admin/auth/refresh',
  '/api/admin/auth/login',
  '/api/admin/auth/register',
  '/api/admin/auth/logout',
]);

// Only ONE refresh per scope may be in flight at a time. The refresh endpoint
// rotates the refresh token (deletes the old row, issues a new one), so concurrent
// refreshes carrying the same cookie race: whoever reads the row after another has
// deleted it gets a 401, and every winner orphans an extra token row. On a fresh
// page load several callers refresh at once — the AuthContext session restore (run
// twice by React StrictMode in dev) plus any query that 401s and retries. Deduping
// means they all share a single rotation and receive the same access token.
const refreshInFlight: Record<TokenScope, Promise<boolean> | null> = {
  user: null,
  admin: null,
};

function performRefresh(scope: TokenScope): Promise<boolean> {
  const url = scope === 'admin' ? '/api/admin/auth/refresh' : '/api/auth/refresh';
  return (async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = await res.json();
      accessTokens[scope] = data.accessToken;
      return true;
    } catch {
      return false;
    }
  })();
}

function refreshAccessToken(scope: TokenScope): Promise<boolean> {
  if (!refreshInFlight[scope]) {
    refreshInFlight[scope] = performRefresh(scope).finally(() => {
      refreshInFlight[scope] = null;
    });
  }
  return refreshInFlight[scope]!;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const scope = scopeFor(path);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessTokens[scope]) {
    headers['Authorization'] = `Bearer ${accessTokens[scope]}`;
  }

  let res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !AUTH_ENDPOINTS.has(path)) {
    const refreshed = await refreshAccessToken(scope);
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessTokens[scope]}`;
      res = await fetch(path, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  return res;
}

// Pulls a human-readable message out of a Nest error body ({ message } or
// { message: string[] }) without exposing raw internals.
export function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (Array.isArray(message)) return String(message[0] ?? fallback);
    if (typeof message === 'string') return message;
  }
  return fallback;
}

// apiFetch + parse + throw-on-error in one place, so callers get typed JSON or a
// thrown Error with the server's message. Used by the admin pages.
export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    throw new Error(extractMessage(body, `Request failed (${res.status})`));
  }
  return body as T;
}
