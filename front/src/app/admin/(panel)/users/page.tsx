'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { AdminUserRow, Paginated } from '@/lib/types';
import { Toast, useToast } from '@/components/Toast';

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { toast, showToast, hideToast } = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<AdminUserRow | null>(null);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (search) params.set('search', search);
  if (role) params.set('role', role);
  if (status) params.set('status', status);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-users', page, search, role, status],
    queryFn: () => apiJson<Paginated<AdminUserRow>>(`/api/admin/users?${params.toString()}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const statusMutation = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: 'ACTIVE' | 'SUSPENDED' }) =>
      apiJson(`/api/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) }),
    onSuccess: () => { showToast('User updated'); invalidate(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: 'USER' | 'ADMIN' }) =>
      apiJson(`/api/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role: next }) }),
    onSuccess: () => { showToast('Role updated'); invalidate(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiJson(`/api/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => { showToast('User deleted'); setConfirmDelete(null); invalidate(); },
    onError: (e: Error) => { showToast(e.message, 'error'); setConfirmDelete(null); },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-muted-foreground text-sm mt-1">Search, filter and manage every account</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search name or email"
          className="border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
        />
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value); setPage(1); }}
          className="border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
        >
          <option value="">All roles</option>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="SUSPENDED">SUSPENDED</option>
        </select>
      </div>

      {isLoading && <div className="text-muted-foreground">Loading...</div>}
      {isError && (
        <div className="text-red-600" role="alert">
          Failed to load users: {error instanceof Error ? error.message : 'unknown error'}
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="text-muted-foreground bg-card border border-border rounded-lg p-6">
          No users match your search or filters.
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Jobs</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3 text-foreground">{u.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${u.role === 'ADMIN' ? 'bg-indigo-100 text-indigo-700' : 'bg-muted text-foreground'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${u.account_status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.account_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.job_count}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/users/${u.id}`} className="text-accent hover:underline">View</Link>
                      <button
                        onClick={() => statusMutation.mutate({ id: u.id, next: u.account_status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}
                        className="text-amber-600 hover:underline"
                      >
                        {u.account_status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                      </button>
                      <button
                        onClick={() => roleMutation.mutate({ id: u.id, next: u.role === 'ADMIN' ? 'USER' : 'ADMIN' })}
                        className="text-indigo-600 hover:underline"
                      >
                        {u.role === 'ADMIN' ? 'Demote' : 'Promote'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(u)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 border border-input rounded-lg disabled:opacity-50 text-foreground"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 border border-input rounded-lg disabled:opacity-50 text-foreground"
          >
            Next
          </button>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 max-w-sm w-full">
            <h2 className="text-lg font-bold text-foreground mb-2">Delete user</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete <span className="font-semibold">{confirmDelete.email}</span> and all
              their jobs? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border border-input rounded-lg text-foreground">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
