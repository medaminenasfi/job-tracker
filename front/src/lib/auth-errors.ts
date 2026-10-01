// Maps the safe, non-secret error codes the OAuth callback redirects with
// (?error=...) to human-readable messages. Unknown codes fall back to a generic
// message so no internal detail ever leaks to the UI.
const MESSAGES: Record<string, string> = {
  google_not_configured:
    'Google sign-in is not configured on this server yet.',
  email_not_verified:
    'Your Google email is not verified, so it cannot be linked to an account.',
  no_email: 'Your Google account did not share an email address.',
  suspended: 'This account is suspended.',
  google_failed: 'Google sign-in failed. Please try again.',
};

export function authErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? 'Something went wrong. Please try again.';
}

// Reads the ?error= code from the current URL on the client. Kept separate from
// useSearchParams so the login/register pages stay statically renderable (no
// Suspense boundary required at build time).
export function readUrlError(): string | null {
  if (typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get('error');
  return authErrorMessage(code);
}
