'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { PasswordInput } from '@/components/PasswordInput';
import { GoogleButton } from '@/components/GoogleButton';
import { TurnstileField, type TurnstileFieldHandle } from '@/components/TurnstileField';
import { readUrlError } from '@/lib/auth-errors';
import Link from 'next/link';
import { ButtonLoader } from '@/components/ui/Loading';

export default function RegisterPage() {
  const { register } = useAuth();
  const [name, setName] = useState('');
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
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await register(name, email, password, token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
          </svg>
          <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
        </div>
        <p className="text-muted-foreground mb-6 text-sm">Start tracking your job applications today</p>

        {error && (
          <div id="register-error" role="alert" className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <GoogleButton label="Sign up with Google" />

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-muted" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-muted" />
        </div>

        <form id="register-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Full name</label>
            <input
              id="register-name"
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-input rounded-lg px-4 py-2.5 text-foreground placeholder-gray-400 focus:outline-none focus:border-ring transition-colors"
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email</label>
            <input
              id="register-email"
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
              id="register-password"
              required
              value={password}
              onChange={setPassword}
              placeholder="Min. 6 characters"
            />
          </div>

          <TurnstileField action="register" onToken={setToken} ref={turnstileRef} />

          <button
            id="register-submit"
            type="submit"
            disabled={loading || !token}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? <ButtonLoader label="Creating account..." /> : token ? 'Create account' : 'Verifying…'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-foreground font-semibold underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
