'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { PasswordInput } from '@/components/PasswordInput';
import { GoogleButton } from '@/components/GoogleButton';
import { TurnstileField, type TurnstileFieldHandle } from '@/components/TurnstileField';
import { readUrlError } from '@/lib/auth-errors';
import Link from 'next/link';
import { ButtonLoader } from '@/components/ui/Loading';
import { AuthShell } from '@/components/AuthShell';

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
    <AuthShell title="Welcome back" subtitle="Sign in to your Job Tracker account">
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-foreground">Password</label>
              <Link
                href="/forgot-password"
                className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
              >
                Forgot password?
              </Link>
            </div>
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
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl shadow-md shadow-accent/25 transition-all hover:shadow-lg hover:scale-[1.01]"
          >
            {loading ? <ButtonLoader label="Signing in..." /> : token ? 'Sign in' : 'Verifying…'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/register" className="text-foreground font-semibold underline hover:text-accent transition-colors">
            Create one
          </Link>
        </p>
    </AuthShell>
  );
}
