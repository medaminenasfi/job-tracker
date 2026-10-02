'use client';

import { useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AuthShell } from '@/components/AuthShell';
import { PasswordInput } from '@/components/PasswordInput';
import { TurnstileField, type TurnstileFieldHandle } from '@/components/TurnstileField';
import { ButtonLoader } from '@/components/ui/Loading';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileFieldHandle>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Reset token is missing or invalid. Please request a new link.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      // The endpoint is behind TurnstileGuard (action reset_password), so the
      // widget token must travel with the request.
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password, turnstileToken }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to reset password');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      // The token is single-use and now spent — reset so the user can retry.
      turnstileRef.current?.reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Set new password" subtitle="Create a secure new password">
      {error && (
        <div role="alert" className="mb-4 p-3.5 bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {success ? (
        <div className="space-y-4 text-center">
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            <p className="font-bold text-base">Password reset successfully!</p>
            <p className="text-xs opacity-90">Redirecting to login in 3 seconds...</p>
          </div>

          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-1.5 w-full bg-accent hover:bg-accent-hover text-white font-semibold py-2.5 rounded-xl shadow-sm transition-all"
          >
            Sign in now
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-password" className="block text-sm font-medium text-foreground mb-1.5">New password</label>
            <PasswordInput
              id="reset-password"
              required
              value={password}
              onChange={setPassword}
              placeholder="Min. 6 characters"
            />
          </div>

          <div>
            <label htmlFor="reset-password-confirm" className="block text-sm font-medium text-foreground mb-1.5">Confirm new password</label>
            <PasswordInput
              id="reset-password-confirm"
              required
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Repeat new password"
            />
          </div>

          <TurnstileField action="reset_password" onToken={setTurnstileToken} ref={turnstileRef} />

          <button
            type="submit"
            disabled={loading || !turnstileToken}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl shadow-sm shadow-accent/20 transition-all hover:shadow-md"
          >
            {loading ? <ButtonLoader label="Updating..." /> : turnstileToken ? 'Update password' : 'Verifying…'}
          </button>

          <div className="pt-2 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to Sign in
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><ButtonLoader label="Loading..." /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
