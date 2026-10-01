'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { AdminJobRow, Paginated } from '@/lib/types';
import { Toast, useToast } from '@/components/Toast';

const PAGE_SIZE = 20;

export default function AdminJobsPage() {
  const queryClient = useQueryClient();
  const { toast, showToast, hideToast } = useToast();
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<AdminJobRow | null>(null);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (userId) params.set('user_id', userId);
  if (status) params.set('status', status);
  if (source) params.set('source', source);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-jobs', page, userId, status, source],
    queryFn: () => apiJson<Paginated<AdminJobRow>>(`/api/admin/jobs?${params.toString()}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiJson(`/api/admin/jobs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      showToast('Job deleted');
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin-jobs'] });
    },
    onError: (e: Error) => { showToast(e.message, 'error'); setConfirmDelete(null); },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Jobs</h1>
        <p className="text-muted-foreground text-sm mt-1">All jobs across every user (read-only except deletion)</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={userId}
          onChange={(e) => { setUserId(e.target.value.trim()); setPage(1); }}
          placeholder="Filter by user UUID"
          className="border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
        >
          <option value="">All statuses</option>
          {['SAVED', 'APPLIED', 'ACCEPTED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => { setSource(e.target.value); setPage(1); }}
          className="border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
        >
          <option value="">All sources</option>
          {['linkedin', 'indeed', 'generic', 'manual'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-muted-foreground">Loading...</div>}
      {isError && (
        <div className="text-red-600" role="alert">
          Failed to load jobs: {error instanceof Error ? error.message : 'unknown error'}
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="text-muted-foreground bg-card border border-border rounded-lg p-6">
          No jobs match your filters.
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((j) => (
                <tr key={j.id} className="border-t border-border">
                  <td className="px-4 py-3 text-foreground">{j.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{j.company}</td>
                  <td className="px-4 py-3 text-muted-foreground">{j.user_email ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{j.status}</td>
                  <td className="px-4 py-3 text-muted-foreground">{j.source ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(j.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setConfirmDelete(j)} className="text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center gap-3 mt-4">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 border border-input rounded-lg disabled:opacity-50 text-foreground">Previous</button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 border border-input rounded-lg disabled:opacity-50 text-foreground">Next</button>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 max-w-sm w-full">
            <h2 className="text-lg font-bold text-foreground mb-2">Delete job</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Delete <span className="font-semibold">{confirmDelete.title}</span> at {confirmDelete.company}?
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border border-input rounded-lg text-foreground">Cancel</button>
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
