'use client';

import { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiJson, extractMessage } from '@/lib/api';
import { useJobStatuses, statusLabel } from '@/lib/useJobStatuses';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Button, buttonStyles } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

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
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);

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

  // Confirm-delete dialog: Escape closes, focus moves to the safe (Cancel)
  // action on open, and body scroll is locked while it is up.
  useEffect(() => {
    if (!confirmDelete) return;
    cancelDeleteRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmDelete(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [confirmDelete]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Parameters" subtitle="Manage your personal data" />

      {message && (
        <Alert tone={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      <Card as="section">
        <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-5 sm:px-6">
          <form onSubmit={handleProfile} className="space-y-4">
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your name"
                  autoComplete="name"
                />
              )}
            </Field>
            <Field label="Email">
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your@email.com"
                  autoComplete="email"
                />
              )}
            </Field>
            <Button type="submit" loading={updateProfileMutation.isPending} className="px-6">
              {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card as="section">
        <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
          <div>
            <CardTitle>Job statuses</CardTitle>
            <CardDescription className="mt-1">
              Manage the stages used by your personal Kanban board. Default stages cannot be removed.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-4 py-5 sm:px-6">
          <form
            className="mb-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (newStatus.trim()) createStatusMutation.mutate();
            }}
          >
            <Input
              value={newStatus}
              onChange={(event) => setNewStatus(event.target.value)}
              placeholder="New status name"
              maxLength={60}
              aria-label="New status name"
              className="min-w-0 flex-1"
            />
            <Button
              type="submit"
              disabled={!newStatus.trim()}
              loading={createStatusMutation.isPending}
              className="shrink-0"
            >
              {createStatusMutation.isPending ? 'Adding...' : 'Add status'}
            </Button>
          </form>
          {statusesLoading ? (
            <p className="text-sm text-muted-foreground">Loading statuses...</p>
          ) : (
            <ul className="space-y-2">
              {statuses.map((status) => (
                <li
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
                    <Input
                      value={editingStatusName}
                      onChange={(event) => setEditingStatusName(event.target.value)}
                      className="min-w-0 flex-1"
                      aria-label="Edit status name"
                      autoFocus
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{statusLabel(status.name)}</span>
                  )}
                  {status.is_default && (
                    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">Default</span>
                  )}
                  {editingStatusId === status.id ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => updateStatusMutation.mutate({ id: status.id, name: editingStatusName.trim() })}
                      disabled={!editingStatusName.trim()}
                      loading={updateStatusMutation.isPending}
                    >
                      {updateStatusMutation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditingStatusId(status.id); setEditingStatusName(status.name); }}
                      >
                        Rename
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteStatusMutation.mutate(status.id)}
                        disabled={deleteStatusMutation.isPending}
                        className="text-danger hover:bg-danger/10 hover:text-danger"
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card as="section">
        <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
          <div>
            <CardTitle>{hasPassword ? 'Change password' : 'Set a password'}</CardTitle>
            {!hasPassword && (
              <CardDescription className="mt-1">
                You sign in with Google. Add a password to also sign in with your email, and to be able to unlink Google later.
              </CardDescription>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 py-5 sm:px-6">
          <form onSubmit={handlePassword} className="space-y-4">
            {hasPassword && (
              <Field label="Current password">
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    required
                    value={pwForm.currentPassword}
                    onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                    autoComplete="current-password"
                  />
                )}
              </Field>
            )}
            <Field label="New password">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  required
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  autoComplete="new-password"
                />
              )}
            </Field>
            <Field label="Confirm new password">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  required
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                  autoComplete="new-password"
                />
              )}
            </Field>
            <Button type="submit" loading={changePasswordMutation.isPending} className="px-6">
              {changePasswordMutation.isPending ? 'Updating...' : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card as="section">
        <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
          <CardTitle>Connected accounts</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">Google</div>
              <div className="text-xs text-muted-foreground">
                {user?.googleConnected
                  ? 'Connected — you can sign in with Google'
                  : 'Not connected'}
              </div>
            </div>
            {user?.googleConnected ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => unlinkGoogleMutation.mutate()}
                disabled={!hasPassword}
                loading={unlinkGoogleMutation.isPending}
                title={!hasPassword ? 'Set a password before unlinking Google' : 'Unlink Google'}
              >
                {unlinkGoogleMutation.isPending ? 'Unlinking...' : 'Unlink'}
              </Button>
            ) : (
              <a href="/api/auth/google" className={buttonStyles('outline', 'md')}>
                Connect
              </a>
            )}
          </div>
          {user?.googleConnected && !hasPassword && (
            <p className="mt-3 text-xs text-muted-foreground">
              Set a password above before unlinking Google, so you don&apos;t lose access to your account.
            </p>
          )}
        </CardContent>
      </Card>

      <Card as="section">
        <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
          <CardTitle>Account Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-4 py-5 text-sm sm:px-6">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">User ID:</span>
            <span className="truncate font-mono text-foreground">{user?.id}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Email:</span>
            <span className="truncate text-foreground">{user?.email}</span>
          </div>
        </CardContent>
      </Card>

      <Card as="section" className="border-danger/30">
        <CardHeader className="border-b border-danger/20 px-4 py-4 sm:px-6">
          <CardTitle className="text-danger">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-5 sm:px-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Permanently delete your account and all of your jobs. This cannot be undone.
          </p>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete account
          </Button>
        </CardContent>
      </Card>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
          onClick={() => setConfirmDelete(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            aria-describedby="delete-account-desc"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl animate-pop-in"
          >
            <h2 id="delete-account-title" className="mb-2 text-lg font-bold text-foreground">
              Delete account
            </h2>
            <p id="delete-account-desc" className="mb-5 text-sm text-muted-foreground">
              This will permanently delete <span className="font-semibold text-foreground">{user?.email}</span> and
              all associated jobs. You will be signed out immediately.
            </p>
            <div className="flex justify-end gap-2">
              <Button ref={cancelDeleteRef} variant="outline" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate()}
                loading={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
