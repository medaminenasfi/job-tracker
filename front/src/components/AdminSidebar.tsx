'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Briefcase,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  X,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ButtonLoader } from '@/components/ui/Loading';

const navItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/admin/audit-logs', label: 'Audit Log', icon: ShieldCheck },
];

function isRouteActive(pathname: string, href: string) {
  return href === '/admin'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

// Deliberately dark-themed so an admin never confuses this area with the
// light user app sidebar.
export function AdminSidebar() {
  const pathname = usePathname();
  const { adminUser, adminLogout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await adminLogout('/admin/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const renderNavigation = (onNavigate?: () => void) => (
    <>
      <div className="border-b border-slate-700 p-6">
        <h1 className="text-xl font-bold text-white">Job Tracker</h1>
        <span className="mt-2 inline-block rounded bg-indigo-500 px-2 py-0.5 text-xs font-semibold text-white">
          ADMIN
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto p-4" aria-label="Admin">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const isActive = isRouteActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-4 py-2.5 transition-colors ${
                    isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="truncate font-medium">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-700 p-4">
        <div className="mb-3 px-4">
          <p className="truncate text-sm font-medium text-white">{adminUser?.name}</p>
          <p className="truncate text-xs text-slate-400">{adminUser?.email}</p>
        </div>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="mb-1 flex w-full items-center gap-2 rounded-lg px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span>User app</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {loggingOut ? <ButtonLoader label="Signing out..." /> : <span>Log out</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-700 bg-slate-900 px-4 text-slate-100 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open admin navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="admin-navigation-drawer"
          className="rounded-lg p-2 text-slate-100 transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span className="truncate px-3 text-sm font-semibold">{navItems.find((item) => isRouteActive(pathname, item.href))?.label ?? 'Admin'}</span>
        <span className="w-9" aria-hidden />
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close admin navigation menu"
            className="absolute inset-0 h-full w-full bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            id="admin-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation menu"
            className="absolute inset-y-0 left-0 flex w-72 flex-col bg-slate-900 text-slate-100 shadow-xl"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close admin navigation menu"
              className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-slate-300 hover:bg-slate-800"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            {renderNavigation(() => setMobileOpen(false))}
          </aside>
        </div>
      )}

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-slate-900 text-slate-100 lg:flex">
        {renderNavigation()}
      </aside>
    </>
  );
}
