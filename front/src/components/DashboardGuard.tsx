'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/Sidebar';

// Client-side guard for the /dashboard area. It withholds the page content until
// the user session has been restored from the refreshToken cookie, so data
// queries never fire before the access token exists (which previously caused a
// premature 401 that raced refresh-token rotation). Mirrors AdminGuard. The
// authoritative boundary remains the API's JwtAuthGuard on every protected call.
export function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return <div className="p-6 text-gray-500">Loading...</div>;
  }
  if (!user) {
    return <div className="p-6 text-gray-500">Redirecting...</div>;
  }

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
