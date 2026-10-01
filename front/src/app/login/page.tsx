'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { PasswordInput } from '@/components/PasswordInput';
import { GoogleButton } from '@/components/GoogleButton';
import { TurnstileField, type TurnstileFieldHandle } from '@/components/TurnstileField';
import { readUrlError } from '@/lib/auth-errors';
import Link from 'next/link';
import { ButtonLoader } from '@/components/ui/Loading';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileFieldHandle>(null);

  // Surface an OAuth failure the callback redirected here with (?error=...).
  useEffect(() => {
    const msg = readUrlError();
    if (msg) setError(msg);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
      // The token is single-use and now spent — reset so the user can retry.
      turnstileRef.current?.reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md border border-border bg-card rounded-2xl p-8 shadow-card animate-pop-in">
        <div className="flex items-center gap-3 mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-foreground">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
          <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
        </div>
        <p className="text-muted-foreground mb-6 text-sm">Sign in to your Job Tracker account</p>

        {error && (
          <div id="login-error" role="alert" className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <GoogleButton />

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-muted" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-muted" />
        </div>

        <form id="login-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email</label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-input rounded-lg px-4 py-2.5 text-foreground placeholder-gray-400 focus:outline-none focus:border-ring transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Password</label>
            <PasswordInput
              id="login-password"
              required
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
            />
          </div>

          <TurnstileField action="login" onToken={setToken} ref={turnstileRef} />

          <button
            id="login-submit"
            type="submit"
            disabled={loading || !token}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? <ButtonLoader label="Signing in..." /> : token ? 'Sign in' : 'Verifying…'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/register" className="text-foreground font-semibold underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
