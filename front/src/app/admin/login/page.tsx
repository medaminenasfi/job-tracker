'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { PasswordInput } from '@/components/PasswordInput';
import { TurnstileField, type TurnstileFieldHandle } from '@/components/TurnstileField';

export default function AdminLoginPage() {
  const { adminLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileFieldHandle>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminLogin(email, password, token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Admin login failed');
      // The token is single-use and now spent — reset so the user can retry.
      turnstileRef.current?.reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md border border-slate-700 rounded-2xl p-8 shadow-lg bg-slate-800">
        <span className="inline-block mb-3 px-2 py-0.5 text-xs font-semibold rounded bg-indigo-500 text-white">
          ADMIN
        </span>
        <h1 className="text-2xl font-bold text-white mb-1">Admin sign in</h1>
        <p className="text-slate-400 mb-6 text-sm">Restricted area — administrators only</p>

        {error && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-600 rounded-lg px-4 py-2.5 bg-slate-900 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Password</label>
            <PasswordInput
              id="admin-login-password"
              required
              dark
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
            />
          </div>

          <TurnstileField action="admin_login" onToken={setToken} ref={turnstileRef} theme="dark" />

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Signing in...' : token ? 'Sign in' : 'Verifying…'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Have an invite?{' '}
          <Link href="/admin/register" className="text-indigo-400 font-semibold underline">
            Register as admin
          </Link>
        </p>
      </div>
    </div>
  );
}
