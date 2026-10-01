'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { PasswordInput } from '@/components/PasswordInput';

export default function AdminRegisterPage() {
  const { adminRegister } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', token: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminRegister(form.name, form.email, form.password, form.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Admin registration failed');
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
        <h1 className="text-2xl font-bold text-white mb-1">Create admin account</h1>
        <p className="text-slate-400 mb-6 text-sm">Requires a valid invite token from an existing admin</p>

        {error && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Invite token</label>
            <input
              type="text"
              required
              value={form.token}
              onChange={update('token')}
              className="w-full border border-slate-600 rounded-lg px-4 py-2.5 bg-slate-900 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Paste your invite token"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={update('name')}
              className="w-full border border-slate-600 rounded-lg px-4 py-2.5 bg-slate-900 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={update('email')}
              className="w-full border border-slate-600 rounded-lg px-4 py-2.5 bg-slate-900 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Password</label>
            <PasswordInput
              id="admin-register-password"
              required
              dark
              value={form.password}
              onChange={(v) => setForm((f) => ({ ...f, password: v }))}
              placeholder="At least 6 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Creating account...' : 'Create admin account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already an admin?{' '}
          <Link href="/admin/login" className="text-indigo-400 font-semibold underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
