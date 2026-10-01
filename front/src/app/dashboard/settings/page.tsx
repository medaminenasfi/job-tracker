'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiJson, extractMessage } from '@/lib/api';

export default function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const hasPassword = user?.hasPassword ?? true;
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });
  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirm: '',
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { name: string; email: string }) => {
      const res = await apiFetch('/api/users/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractMessage(err, 'Failed to update profile'));
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['user'], data);
      flash('success', 'Profile updated successfully!');
    },
    onError: (e: Error) => flash('error', e.message),
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword?: string; newPassword: string }) =>
      apiJson('/api/users/password', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: async () => {
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      flash('success', hasPassword ? 'Password changed successfully!' : 'Password set successfully!');
      // A Google-only account that just set its first password now hasPassword.
      await refreshUser();
    },
    onError: (e: Error) => flash('error', e.message),
  });

  const unlinkGoogleMutation = useMutation({
    mutationFn: () => apiJson('/api/users/google', { method: 'DELETE' }),
    onSuccess: async () => {
      flash('success', 'Google account unlinked.');
      await refreshUser();
    },
    onError: (e: Error) => flash('error', e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiJson('/api/users/me', { method: 'DELETE' }),
    onSuccess: async () => {
      // Account (and its sessions) are gone; clear local state and leave.
      await logout('/login');
    },
    onError: (e: Error) => {
      setConfirmDelete(false);
      flash('error', e.message);
    },
  });

  const handleProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  const handlePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword.length < 6) {
      flash('error', 'New password must be at least 6 characters');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirm) {
      flash('error', 'New passwords do not match');
      return;
    }
    if (hasPassword && !pwForm.currentPassword) {
      flash('error', 'Current password is required');
      return;
    }
    changePasswordMutation.mutate({
      // Only send currentPassword when the account already has one; a Google-only
      // account is setting its first password.
      ...(hasPassword ? { currentPassword: pwForm.currentPassword } : {}),
      newPassword: pwForm.newPassword,
    });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black">Parameters</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your personal data</p>
      </div>

      {message && (
        <div
          className={`max-w-2xl mb-4 p-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
          role="status"
        >
          {message.text}
        </div>
      )}

      <div className="max-w-2xl space-y-6">
        <section className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-bold text-black mb-4">Personal Information</h2>
          <form onSubmit={handleProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-black mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
                placeholder="your@email.com"
              />
            </div>
            <button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-bold text-black mb-1">
            {hasPassword ? 'Change password' : 'Set a password'}
          </h2>
          {!hasPassword && (
            <p className="text-sm text-gray-500 mb-4">
              You sign in with Google. Add a password to also sign in with your
              email, and to be able to unlink Google later.
            </p>
          )}
          <form onSubmit={handlePassword} className={`space-y-4 ${hasPassword ? 'mt-4' : ''}`}>
            {hasPassword && (
              <div>
                <label className="block text-sm font-medium text-black mb-1">Current password</label>
                <input
                  type="password"
                  required
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
                  autoComplete="current-password"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-black mb-1">New password</label>
              <input
                type="password"
                required
                value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-1">Confirm new password</label>
              <input
                type="password"
                required
                value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {changePasswordMutation.isPending ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-bold text-black mb-4">Connected accounts</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-black">Google</div>
              <div className="text-xs text-gray-500">
                {user?.googleConnected
                  ? 'Connected — you can sign in with Google'
                  : 'Not connected'}
              </div>
            </div>
            {user?.googleConnected ? (
              <button
                type="button"
                onClick={() => unlinkGoogleMutation.mutate()}
                disabled={unlinkGoogleMutation.isPending || !hasPassword}
                title={
                  !hasPassword
                    ? 'Set a password before unlinking Google'
                    : 'Unlink Google'
                }
                className="px-4 py-2 border border-gray-300 rounded-lg text-black text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {unlinkGoogleMutation.isPending ? 'Unlinking...' : 'Unlink'}
              </button>
            ) : (
              <a
                href="/api/auth/google"
                className="px-4 py-2 border border-gray-300 rounded-lg text-black text-sm hover:bg-gray-50 transition-colors"
              >
                Connect
              </a>
            )}
          </div>
          {user?.googleConnected && !hasPassword && (
            <p className="mt-3 text-xs text-gray-500">
              Set a password above before unlinking Google, so you don&apos;t lose
              access to your account.
            </p>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-bold text-black mb-4">Account Info</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">User ID:</span>
              <span className="text-black font-mono">{user?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Email:</span>
              <span className="text-black">{user?.email}</span>
            </div>
          </div>
        </section>

        <section className="bg-white border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-bold text-red-600 mb-2">Danger zone</h2>
          <p className="text-sm text-gray-600 mb-4">
            Permanently delete your account and all of your jobs. This cannot be undone.
          </p>
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-5 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
          >
            Delete account
          </button>
        </section>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h2 className="text-lg font-bold text-black mb-2">Delete account</h2>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete <span className="font-semibold">{user?.email}</span> and
              all associated jobs. You will be signed out immediately.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-black"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
