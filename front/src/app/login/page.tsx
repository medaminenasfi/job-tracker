'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { PasswordInput } from '@/components/PasswordInput';
import Link from 'next/link';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md border border-black rounded-2xl p-8 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-black">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
          <h1 className="text-2xl font-bold text-black">Welcome back</h1>
        </div>
        <p className="text-gray-600 mb-6 text-sm">Sign in to your Job Tracker account</p>

        {error && (
          <div id="login-error" className="mb-4 p-3 bg-red-50 border border-red-300 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form id="login-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-black mb-1">Email</label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-black placeholder-gray-400 focus:outline-none focus:border-black transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Password</label>
            <PasswordInput
              id="login-password"
              required
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
            />
          </div>

          <button
            id="login-submit"
            type="submit"
            disabled={loading}
            className="w-full bg-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          No account?{' '}
          <Link href="/register" className="text-black font-semibold underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
