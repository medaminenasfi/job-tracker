'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

// Reusable Cloudflare Turnstile widget (Phase 10). Wraps @marsidev/react-turnstile
// so /login, /register and /admin/login share one implementation (AGENTS.md §4:
// never duplicate). The parent owns the token via `onToken` and can force a fresh
// challenge after a failed submit through the imperative `reset()` handle — a
// spent token would otherwise leave the user stuck.

export type TurnstileFieldHandle = { reset: () => void };

type TurnstileFieldProps = {
  // Per-form action (login | register | admin_login). The backend re-checks it so
  // a token minted for one form can't be replayed against another.
  action: string;
  // Called with the token on success, and null on expire/error/reset.
  onToken: (token: string | null) => void;
  theme?: 'auto' | 'light' | 'dark';
};

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export const TurnstileField = forwardRef<TurnstileFieldHandle, TurnstileFieldProps>(
  function TurnstileField({ action, onToken, theme = 'auto' }, ref) {
    const widgetRef = useRef<TurnstileInstance | undefined>(undefined);

    useImperativeHandle(ref, () => ({
      reset: () => {
        widgetRef.current?.reset();
        onToken(null);
      },
    }));

    if (!SITE_KEY) {
      // Misconfiguration must be visible, not silently bypassed: without a site
      // key no token is produced, so the submit button stays disabled.
      return (
        <p className="text-xs text-red-600" role="alert">
          CAPTCHA is not configured (missing NEXT_PUBLIC_TURNSTILE_SITE_KEY).
        </p>
      );
    }

    return (
      <Turnstile
        ref={widgetRef}
        siteKey={SITE_KEY}
        options={{ action, theme, size: 'flexible' }}
        onSuccess={(token) => onToken(token)}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
      />
    );
  },
);
