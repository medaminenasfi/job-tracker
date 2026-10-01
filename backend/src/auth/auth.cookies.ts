import type { CookieOptions } from 'express';

// Two independent refresh cookies so a normal user session (/dashboard) and an
// admin session (/admin) can coexist without clobbering each other. They differ
// only by name; both live at path "/" so Next middleware (which runs on page
// navigations like /admin/*) and the API (mounted under /api) both receive them.
export const REFRESH_COOKIE_NAME = 'refreshToken';
export const ADMIN_REFRESH_COOKIE_NAME = 'adminRefreshToken';

// Identifies which refresh cookie a session reads/writes.
export interface CookieSpec {
  name: string;
}

export const USER_COOKIE: CookieSpec = { name: REFRESH_COOKIE_NAME };
export const ADMIN_COOKIE: CookieSpec = { name: ADMIN_REFRESH_COOKIE_NAME };

export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}
