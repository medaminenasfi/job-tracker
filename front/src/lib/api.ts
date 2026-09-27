
// Same-origin client: next.config.mjs rewrites /api/* to the Nest backend so the
// httpOnly refresh cookie is stored on the web origin (required for middleware).

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (
    res.status === 401 &&
    path !== '/api/auth/refresh' &&
    path !== '/api/auth/login' &&
    path !== '/api/auth/register' &&
    path !== '/api/auth/logout'
  ) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(path, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  return res;
}
