'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/Sidebar';
import { TopNavbar } from '@/components/TopNavbar';
import { PageTransition } from '@/components/PageTransition';
import { PageLoader } from '@/components/ui/Loading';

const COLLAPSE_KEY = 'jt_sidebar_collapsed';

// Client-side guard for the /dashboard area. It withholds the page content until
// the user session has been restored from the refreshToken cookie, so data
// queries never fire before the access token exists (which previously caused a
// premature 401 that raced refresh-token rotation). Mirrors AdminGuard. The
// authoritative boundary remains the API's JwtAuthGuard on every protected call.
export function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Desktop collapse state, persisted in localStorage so a refresh keeps it.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore after hydration (SSR always renders expanded).
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return <PageLoader label="Loading your workspace..." />;
  }
  if (!user) {
    return <PageLoader label="Redirecting to sign in..." />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        isCollapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNavbar
          isCollapsed={collapsed}
          onToggleSidebar={toggleCollapsed}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="min-w-0 flex-1 overflow-auto pt-14 lg:pt-0">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
