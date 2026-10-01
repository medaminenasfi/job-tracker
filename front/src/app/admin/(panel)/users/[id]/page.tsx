'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { AdminUserDetail } from '@/lib/types';

export default function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => apiJson<AdminUserDetail>(`/api/admin/users/${id}`),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (isError) {
    return (
      <div className="p-6 text-red-600" role="alert">
        Failed to load user: {error instanceof Error ? error.message : 'unknown error'}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="p-6">
      <Link href="/admin/users" className="text-sm text-accent hover:underline">← Back to users</Link>

      <div className="mt-4 mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">{data.name}</h1>
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${data.role === 'ADMIN' ? 'bg-indigo-100 text-indigo-700' : 'bg-muted text-foreground'}`}>
          {data.role}
        </span>
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${data.account_status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {data.account_status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Profile</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Email</dt><dd className="text-foreground">{data.email}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">User ID</dt><dd className="text-foreground font-mono">{data.id}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Joined</dt><dd className="text-foreground">{new Date(data.created_at).toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Last login</dt><dd className="text-foreground">{data.last_login_at ? new Date(data.last_login_at).toLocaleString() : '—'}</dd></div>
          </dl>

          <h3 className="text-md font-bold text-foreground mt-6 mb-3">Jobs by status</h3>
          {data.jobCounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No jobs.</p>
          ) : (
            <div className="space-y-2">
              {data.jobCounts.map((c) => (
                <div key={c.status} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{c.status}</span>
                  <span className="font-medium text-foreground">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Jobs (read-only)</h2>
          {data.jobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">This user has no jobs.</p>
          ) : (
            <ul className="space-y-3">
              {data.jobs.map((j) => (
                <li key={j.id} className="border-b border-border pb-3 last:border-0">
                  <div className="font-medium text-foreground">{j.title}</div>
                  <div className="text-sm text-muted-foreground">{j.company}</div>
                  <div className="text-xs text-muted-foreground mt-1">{j.status}{j.source ? ` · ${j.source}` : ''}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
