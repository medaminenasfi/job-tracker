'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { PasswordInput } from '@/components/PasswordInput';
import Link from 'next/link';

export default function RegisterPage() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await register(name, email, password);
    } catch (err: any) {
      setError(err.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md border border-black rounded-2xl p-8 shadow-lg">
phase        <div className="flex items-center gap-3 mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-black">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
          </svg>
          <h1 className="text-2xl font-bold text-black">Create your account</h1>
        </div>
        <p className="text-gray-600 mb-6 text-sm">Start tracking your job applications today</p>

        {error && (
          <div id="register-error" className="mb-4 p-3 bg-red-50 border border-red-300 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form id="register-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-black mb-1">Full name</label>
            <input
              id="register-name"
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-black placeholder-gray-400 focus:outline-none focus:border-black transition-colors"
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Email</label>
            <input
              id="register-email"
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
              id="register-password"
              required
              value={password}
              onChange={setPassword}
              placeholder="Min. 6 characters"
            />
          </div>

          <button
            id="register-submit"
            type="submit"
            disabled={loading}
            className="w-full bg-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="text-black font-semibold underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
