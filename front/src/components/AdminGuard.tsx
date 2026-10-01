'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { AdminSidebar } from '@/components/AdminSidebar';

// Client-side convenience guard: keeps non-admins out of the UI. The authoritative
// boundary is the API's RolesGuard, which returns 403 on every /admin/* call.
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { adminUser, adminLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!adminLoading && adminUser?.role !== 'ADMIN') {
      router.replace('/admin/login');
    }
  }, [adminLoading, adminUser, router]);

  if (adminLoading) {
    return <div className="p-6 text-gray-500">Loading...</div>;
  }
  if (adminUser?.role !== 'ADMIN') {
    return <div className="p-6 text-gray-500">Redirecting...</div>;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
