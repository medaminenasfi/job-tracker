'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { AuditLogRow, Paginated } from '@/lib/types';

const PAGE_SIZE = 30;

export default function AdminAuditLogPage() {
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-audit-logs', page],
    queryFn: () => apiJson<Paginated<AuditLogRow>>(`/api/admin/audit-logs?${params.toString()}`),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black">Audit Log</h1>
        <p className="text-gray-500 text-sm mt-1">Who did what, and when</p>
      </div>

      {isLoading && <div className="text-gray-500">Loading...</div>}
      {isError && (
        <div className="text-red-600" role="alert">
          Failed to load audit logs: {error instanceof Error ? error.message : 'unknown error'}
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="text-gray-500 bg-white border border-gray-200 rounded-lg p-6">
          No admin actions recorded yet.
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((log) => (
                <tr key={log.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-500">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-600">{log.admin_email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {log.target_type ? `${log.target_type}` : '—'}
                    {log.target_id ? <span className="font-mono text-xs text-gray-400"> · {log.target_id}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center gap-3 mt-4">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50 text-black">Previous</button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50 text-black">Next</button>
        </div>
      )}
    </div>
  );
}
