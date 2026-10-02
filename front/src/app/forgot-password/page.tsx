'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, CheckCircle2, KeyRound } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AuthShell } from '@/components/AuthShell';
import { TurnstileField, type TurnstileFieldHandle } from '@/components/TurnstileField';
import { ButtonLoader } from '@/components/ui/Loading';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileFieldHandle>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // The endpoint is behind TurnstileGuard (action forgot_password), so the
      // widget token must travel with the request.
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email, turnstileToken: token }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to request password reset');
      }

      setSuccess(true);
      if (data.resetToken) {
        setResetToken(data.resetToken);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      // The token is single-use and now spent — reset so the user can retry.
      turnstileRef.current?.reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Forgot password" subtitle="Reset your account credentials">
      {error && (
        <div role="alert" className="mb-4 p-3.5 bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {success ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">Reset instructions sent</p>
              <p className="mt-1 text-xs opacity-90">
                If an account exists for <span className="font-medium">{email}</span>, password reset instructions have been generated.
              </p>
            </div>
          </div>

          {/* In dev mode, surface quick test link */}
          {resetToken && (
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-xs space-y-2">
              <p className="font-semibold text-accent flex items-center gap-1.5">
                <KeyRound className="h-4 w-4" />
                Dev Simulation Link:
              </p>
              <p className="text-muted-foreground">Click below to test the reset flow directly with your token:</p>
              <Link
                href={`/reset-password?token=${resetToken}`}
                className="inline-block font-semibold text-accent underline break-all"
              >
                Proceed to Reset Password →
              </Link>
            </div>
          )}

          <div className="pt-2 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Sign in
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Enter your email address and we will generate instructions to reset your password.
          </p>

          <div>
            <label htmlFor="forgot-email" className="block text-sm font-medium text-foreground mb-1.5">Email address</label>
            <div className="relative">
              <input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-input bg-background pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-all"
                placeholder="you@example.com"
              />
              <Mail className="h-4 w-4 text-muted-foreground absolute left-3.5 top-3" />
            </div>
          </div>

          <TurnstileField action="forgot_password" onToken={setToken} ref={turnstileRef} />

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl shadow-sm shadow-accent/20 transition-all hover:shadow-md"
          >
            {loading ? <ButtonLoader label="Sending..." /> : token ? 'Send reset instructions' : 'Verifying…'}
          </button>

          <div className="pt-2 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign in
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
