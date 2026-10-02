import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResetPasswordPage from './page';

const { apiFetchMock, pushMock, turnstile, url } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  pushMock: vi.fn(),
  // Controllable stand-in for the real Turnstile widget (needs site key + network).
  turnstile: { token: 'stub-turnstile-token' as string | null },
  url: { token: 'reset-token-1' },
}));

// Next.js link/navigation are framework glue — assert on href/behavior instead.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams(url.token ? `token=${url.token}` : ''),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

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

function fillPasswords(newPassword: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: newPassword } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
}

beforeEach(() => {
  apiFetchMock.mockReset();
  pushMock.mockReset();
  turnstile.token = 'stub-turnstile-token';
  url.token = 'reset-token-1';
});

describe('ResetPasswordPage', () => {
  it('resets the password with the URL token and Turnstile token, then shows success', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Password has been successfully reset.' }),
    });

    render(<ResetPasswordPage />);
    fillPasswords('secret-123', 'secret-123');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const [path, options] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/auth/reset-password');
    expect(JSON.parse(String(options.body))).toEqual({
      token: 'reset-token-1',
      password: 'secret-123',
      turnstileToken: 'stub-turnstile-token',
    });

    expect(await screen.findByText('Password reset successfully!')).toBeTruthy();
  });

  it('rejects a missing URL token without calling the API', async () => {
    url.token = '';

    render(<ResetPasswordPage />);
    fillPasswords('secret-123', 'secret-123');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Reset token is missing');
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    render(<ResetPasswordPage />);
    fillPasswords('secret-123', 'different-123');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Passwords do not match');
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('surfaces an invalid or expired token error from the server', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Invalid or expired reset token' }),
    });

    render(<ResetPasswordPage />);
    fillPasswords('secret-123', 'secret-123');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Invalid or expired reset token');
    expect(screen.queryByText('Password reset successfully!')).toBeNull();
  });

  it('keeps submit disabled until the CAPTCHA token arrives', () => {
    turnstile.token = null;

    render(<ResetPasswordPage />);
    const button = screen.getByRole('button', { name: 'Verifying…' }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
