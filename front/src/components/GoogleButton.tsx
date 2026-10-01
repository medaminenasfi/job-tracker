'use client';

import { useState } from 'react';
import { LoadingSpinner } from '@/components/ui/Loading';

// "Continue with Google" — a plain link to the API's OAuth entry point. It goes
// through the same-origin Next proxy (/api/auth/google) so the whole redirect
// flow, the state cookie, and the final refresh cookie all stay on the web origin.
export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  const [connecting, setConnecting] = useState(false);

  return (
    <a
      id="google-signin"
      href="/api/auth/google"
      onClick={() => setConnecting(true)}
      aria-busy={connecting}
      className={`w-full flex items-center justify-center gap-3 border border-input rounded-lg px-4 py-2.5 text-foreground font-semibold hover:bg-muted transition-colors ${
        connecting ? 'pointer-events-none opacity-60' : ''
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z"
        />
      </svg>
      {connecting ? <><LoadingSpinner size="sm" /> Connecting...</> : label}
    </a>
  );
}
