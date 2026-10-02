import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ForgotPasswordPage from './page';

const { apiFetchMock, turnstile } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  // Controllable stand-in for the real Turnstile widget (needs site key + network).
  turnstile: { token: 'stub-turnstile-token' as string | null },
}));

// Next.js link is framework glue — assert on href instead.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// Stub the CAPTCHA widget so the guarded submit path can be exercised without
// the site key or a network round-trip.
vi.mock('@/components/TurnstileField', async () => {
  const { createElement, useEffect } = await import('react');
  return {
    TurnstileField: ({
      onToken,
      action,
    }: {
      onToken: (token: string | null) => void;
      action: string;
    }) => {
      useEffect(() => {
        onToken(turnstile.token);
      }, [onToken]);
      return createElement('div', { 'data-testid': 'turnstile-stub', 'data-action': action });
    },
  };
});

beforeEach(() => {
  apiFetchMock.mockReset();
  turnstile.token = 'stub-turnstile-token';
});

describe('ForgotPasswordPage', () => {
  it('submits the email with the Turnstile token and shows the dev reset link', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'If that email is registered, password reset instructions have been generated.',
        resetToken: 'raw-token-123',
      }),
    });

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset instructions' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const [path, options] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/auth/forgot-password');
    expect(JSON.parse(String(options.body))).toEqual({
      email: 'ada@example.com',
      turnstileToken: 'stub-turnstile-token',
    });

    expect(await screen.findByText('Reset instructions sent')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Proceed to Reset Password/ }).getAttribute('href'),
    ).toBe('/reset-password?token=raw-token-123');
  });

  it('surfaces server errors as an alert without the dev link', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'CAPTCHA verification failed' }),
    });

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset instructions' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('CAPTCHA verification failed');
    expect(screen.queryByRole('link', { name: /Proceed to Reset Password/ })).toBeNull();
    // Form stays usable so the user can retry.
    expect(screen.getByRole('button', { name: 'Send reset instructions' })).toBeTruthy();
  });

  it('keeps submit disabled until the CAPTCHA token arrives', () => {
    turnstile.token = null;

    render(<ForgotPasswordPage />);
    const button = screen.getByRole('button', { name: 'Verifying…' }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
