// Google OAuth configuration helpers. The client id/secret live ONLY in the API
// environment (AGENTS.md rule #5 — never commit secrets). When they are absent or
// still set to the shipped placeholder, Google sign-in is reported as
// "not configured" so the app still boots and the route returns a clear error
// instead of crashing on a half-initialized Passport strategy.

export const GOOGLE_CLIENT_ID_PLACEHOLDER = 'google-client-id-not-configured';
export const GOOGLE_CLIENT_SECRET_PLACEHOLDER =
  'google-client-secret-not-configured';

// Default callback goes through the Next.js proxy on the web origin so the
// refresh cookie lands on the same origin the browser uses (required for
// middleware + same-origin apiFetch). Must match the URI registered in Google
// Cloud Console.
export const DEFAULT_GOOGLE_CALLBACK_URL =
  'http://localhost:3001/api/auth/google/callback';

export function googleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID_PLACEHOLDER;
}

export function googleClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET || GOOGLE_CLIENT_SECRET_PLACEHOLDER;
}

export function googleCallbackUrl(): string {
  return process.env.GOOGLE_CALLBACK_URL || DEFAULT_GOOGLE_CALLBACK_URL;
}

// True only when both real credentials are present (non-empty and not the
// placeholder). Used to gate the OAuth routes and the frontend buttons.
export function isGoogleConfigured(): boolean {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return (
    !!id &&
    !!secret &&
    id !== GOOGLE_CLIENT_ID_PLACEHOLDER &&
    secret !== GOOGLE_CLIENT_SECRET_PLACEHOLDER
  );
}
