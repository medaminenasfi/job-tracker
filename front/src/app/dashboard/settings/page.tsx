'use client';

import { useState } from 'react';
import { GripVertical } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiJson, extractMessage } from '@/lib/api';
import { ButtonLoader } from '@/components/ui/Loading';
import { useJobStatuses, statusLabel } from '@/lib/useJobStatuses';

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
  const { data: statuses = [], isLoading: statusesLoading } = useJobStatuses();
  const [newStatus, setNewStatus] = useState('');
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editingStatusName, setEditingStatusName] = useState('');
  const [draggedStatusId, setDraggedStatusId] = useState<string | null>(null);

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

  const createStatusMutation = useMutation({
    mutationFn: () => apiJson('/api/users/statuses', {
      method: 'POST',
      body: JSON.stringify({ name: newStatus.trim() }),
    }),
    onSuccess: async () => {
      setNewStatus('');
      await queryClient.invalidateQueries({ queryKey: ['job-statuses'] });
      flash('success', 'Status added.');
    },
    onError: (e: Error) => flash('error', e.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, name, position }: { id: string; name?: string; position?: number }) => apiJson(`/api/users/statuses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, position }),
    }),
    onSuccess: async () => {
      setEditingStatusId(null);
      await queryClient.invalidateQueries({ queryKey: ['job-statuses'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      flash('success', 'Status updated.');
    },
    onError: (e: Error) => flash('error', e.message),
  });

  const deleteStatusMutation = useMutation({
    mutationFn: (id: string) => apiJson(`/api/users/statuses/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['job-statuses'] });
      flash('success', 'Status deleted.');
    },
    onError: (e: Error) => flash('error', e.message),
  });

  const moveStatusBefore = async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const fromIndex = statuses.findIndex((status) => status.id === draggedId);
    const targetIndex = statuses.findIndex((status) => status.id === targetId);
    if (fromIndex < 0 || targetIndex < 0) return;

    const ordered = [...statuses];
    const [dragged] = ordered.splice(fromIndex, 1);
    ordered.splice(targetIndex, 0, dragged);
    await Promise.all(
      ordered.map((status, index) =>
        status.position === index
          ? Promise.resolve()
          : updateStatusMutation.mutateAsync({ id: status.id, position: index }),
      ),
    );
    await queryClient.invalidateQueries({ queryKey: ['job-statuses'] });
    setDraggedStatusId(null);
  };

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
    <div className="min-w-0 p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Parameters</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your personal data</p>
      </div>

      {message && (
        <div
          className={`max-w-2xl mb-4 p-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}
          role="status"
        >
          {message.text}
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl space-y-6">
        <section className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Personal Information</h2>
          <form onSubmit={handleProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
                placeholder="your@email.com"
              />
            </div>
            <button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="px-6 py-2 bg-accent text-white rounded-lg hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {updateProfileMutation.isPending ? <ButtonLoader label="Saving..." /> : 'Save Changes'}
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-foreground">Job statuses</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage the stages used by your personal Kanban board. Default stages cannot be removed.
            </p>
          </div>
          <form
            className="mb-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (newStatus.trim()) createStatusMutation.mutate();
            }}
          >
            <input
              value={newStatus}
              onChange={(event) => setNewStatus(event.target.value)}
              placeholder="New status name"
              maxLength={60}
              className="min-w-0 flex-1 rounded-lg border border-input px-4 py-2 text-foreground focus:outline-none focus:border-ring"
            />
            <button
              type="submit"
              disabled={!newStatus.trim() || createStatusMutation.isPending}
              className="rounded-lg bg-accent px-4 py-2 font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createStatusMutation.isPending ? <ButtonLoader label="Adding..." /> : 'Add status'}
            </button>
          </form>
          {statusesLoading ? (
            <p className="text-sm text-muted-foreground">Loading statuses...</p>
          ) : (
            <div className="space-y-2">
              {statuses.map((status) => (
                <div
                  key={status.id}
                  draggable={editingStatusId !== status.id}
                  onDragStart={() => setDraggedStatusId(status.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => draggedStatusId && moveStatusBefore(draggedStatusId, status.id)}
                  onDragEnd={() => setDraggedStatusId(null)}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/35 p-3 transition-colors ${
                    draggedStatusId === status.id ? 'opacity-50' : 'hover:border-accent/50'
                  }`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-label="Drag to reorder" />
                  {editingStatusId === status.id ? (
                    <input
                      value={editingStatusName}
                      onChange={(event) => setEditingStatusName(event.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground"
                      autoFocus
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{statusLabel(status.name)}</span>
                  )}
                  {status.is_default && (
                    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">Default</span>
                  )}
                  {editingStatusId === status.id && (
                    <button
                      type="button"
                      onClick={() => updateStatusMutation.mutate({ id: status.id, name: editingStatusName.trim() })}
                      disabled={!editingStatusName.trim() || updateStatusMutation.isPending}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >Save
                    </button>
                  )}
                  {editingStatusId !== status.id && (
                    <button type="button" onClick={() => { setEditingStatusId(status.id); setEditingStatusName(status.name); }} className="text-xs font-medium text-accent">Rename</button>
                  )}
                  {editingStatusId !== status.id && (
                    <button
                      type="button"
                      onClick={() => deleteStatusMutation.mutate(status.id)}
                      disabled={deleteStatusMutation.isPending}
                      className="text-xs font-medium text-red-600 disabled:opacity-50"
                    >Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold text-foreground mb-1">
            {hasPassword ? 'Change password' : 'Set a password'}
          </h2>
          {!hasPassword && (
            <p className="text-sm text-muted-foreground mb-4">
              You sign in with Google. Add a password to also sign in with your
              email, and to be able to unlink Google later.
            </p>
          )}
          <form onSubmit={handlePassword} className={`space-y-4 ${hasPassword ? 'mt-4' : ''}`}>
            {hasPassword && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Current password</label>
                <input
                  type="password"
                  required
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                  className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
                  autoComplete="current-password"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">New password</label>
              <input
                type="password"
                required
                value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Confirm new password</label>
              <input
                type="password"
                required
                value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="px-6 py-2 bg-accent text-white rounded-lg hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {changePasswordMutation.isPending ? <ButtonLoader label="Updating..." /> : 'Update password'}
            </button>
          </form>
        </section>

        <section className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Connected accounts</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">Google</div>
              <div className="text-xs text-muted-foreground">
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
                className="px-4 py-2 border border-input rounded-lg text-foreground text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {unlinkGoogleMutation.isPending ? <ButtonLoader label="Unlinking..." /> : 'Unlink'}
              </button>
            ) : (
              <a
                href="/api/auth/google"
                className="px-4 py-2 border border-input rounded-lg text-foreground text-sm hover:bg-muted transition-colors"
              >
                Connect
              </a>
            )}
          </div>
          {user?.googleConnected && !hasPassword && (
            <p className="mt-3 text-xs text-muted-foreground">
              Set a password above before unlinking Google, so you don&apos;t lose
              access to your account.
            </p>
          )}
        </section>

        <section className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Account Info</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">User ID:</span>
              <span className="text-foreground font-mono">{user?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email:</span>
              <span className="text-foreground">{user?.email}</span>
            </div>
          </div>
        </section>

        <section className="bg-card border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-bold text-red-600 mb-2">Danger zone</h2>
          <p className="text-sm text-muted-foreground mb-4">
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
          <div className="bg-card rounded-lg p-6 max-w-sm w-full">
            <h2 className="text-lg font-bold text-foreground mb-2">Delete account</h2>
            <p className="text-sm text-muted-foreground mb-4">
              This will permanently delete <span className="font-semibold">{user?.email}</span> and
              all associated jobs. You will be signed out immediately.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 border border-input rounded-lg text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? <ButtonLoader label="Deleting..." /> : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
