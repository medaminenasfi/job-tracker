import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';

// CSRF protection for the OAuth redirect flow without server sessions.
//
// passport-oauth2 verifies a `state` value across the two redirects. Its default
// store relies on express-session, which this stateless API does not use. This
// store keeps the random state in a short-lived httpOnly cookie set when the flow
// starts (GET /auth/google) and compares it on the callback. Because both hops go
// through the same web origin (Next proxy), the cookie round-trips correctly, and
// sameSite=lax is honoured on the top-level GET navigation back from Google.
//
//passport-oauth2 selects the store variant by function arity: a 2-arg `store`
// and a 3-arg `verify` are the no-metadata forms it calls here. The class is
// intentionally NOT declared `implements StateStore` because that interface is
// overloaded with a metadata variant we don't use; the shape below is what
// passport actually invokes at runtime.

export const GOOGLE_STATE_COOKIE = 'google_oauth_state';

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (err: Error | null, ok: boolean) => void;

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes to finish the consent screen

function stateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_MAX_AGE_MS,
  };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export class CookieStateStore {
  store(req: Request, cb: StoreCallback): void {
    const res = (req as Request & { res?: Response }).res;
    if (!res) return cb(new Error('Response unavailable for OAuth state'));
    const state = randomBytes(16).toString('hex');
    res.cookie(GOOGLE_STATE_COOKIE, state, stateCookieOptions());
    cb(null, state);
  }

  verify(req: Request, providedState: string, cb: VerifyCallback): void {
    const res = (req as Request & { res?: Response }).res;
    const cookieState =
      (req as Request & { cookies?: Record<string, string> }).cookies?.[
        GOOGLE_STATE_COOKIE
      ];
    // Always clear the one-time state cookie, whether or not it matched.
    if (res) res.clearCookie(GOOGLE_STATE_COOKIE, stateCookieOptions());
    if (
      !cookieState ||
      !providedState ||
      !safeEqual(cookieState, providedState)
    ) {
      return cb(null, false);
    }
    cb(null, true);
  }
}
