'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { AdminSidebar } from '@/components/AdminSidebar';
import { PageTransition } from '@/components/PageTransition';
import { PageLoader } from '@/components/ui/Loading';

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
    return <PageLoader label="Loading admin workspace..." />;
  }
  if (adminUser?.role !== 'ADMIN') {
    return <PageLoader label="Redirecting to admin sign in..." />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="min-w-0 flex-1 overflow-auto pt-14 lg:pt-0">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
