'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import sidebarLogo from '@/assest/Logo_minimaliste_AT_avec_swoosh-removebg-preview.png';
import { ButtonLoader } from '@/components/ui/Loading';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/jobs', label: 'Job Track', icon: Briefcase },
  { href: '/dashboard/settings', label: 'Parameters', icon: Settings },
];

const COLLAPSE_KEY = 'jt_sidebar_collapsed';

function isRouteActive(pathname: string, href: string) {
  return href === '/dashboard'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

// Phase 11.2 — collapsible sidebar with nested active routes, staggered nav
// fade-in, tooltips when icon-only, and a mobile/tablet slide-in drawer.
export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const activeItem = navItems.find((item) => isRouteActive(pathname, item.href));

  // Restore the desktop collapse state after hydration (SSR always renders wide).
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  // Mobile drawer: closes on navigation, on Escape, and locks body scroll.
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

  const renderNav = (isCollapsed: boolean, onNavigate?: () => void) => (
    <>
      <div className="relative flex h-16 shrink-0 items-center gap-2 border-b border-border px-3">
        {isCollapsed ? (
          <div className="flex w-full items-center justify-center gap-1">
            <span className="relative h-9 w-9 shrink-0">
              <Image src={sidebarLogo} alt="ApplyTracker" fill sizes="36px" className="object-contain dark:invert" />
            </span>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              aria-expanded={false}
              title="Expand sidebar"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <>
            <span className="relative h-10 w-44 shrink-0">
              <Image src={sidebarLogo} alt="ApplyTracker" fill sizes="176px" className="object-contain object-left dark:invert" />
            </span>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              aria-expanded={!isCollapsed}
              title="Collapse sidebar"
              className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3" aria-label="Main">
        <ul className="space-y-1">
          {navItems.map((item, index) => {
            const isActive = isRouteActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  title={isCollapsed ? item.label : undefined}
                  style={{ animationDelay: `${index * 40}ms` }}
                  className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 animate-fade-in-up transition-colors ${
                    isCollapsed ? 'justify-center px-2' : ''
                  } ${
                    isActive
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <item.icon
                    className="h-5 w-5 shrink-0 transition-transform duration-150 group-hover:scale-110"
                    aria-hidden
                  />
                  <span className={`text-sm font-medium ${isCollapsed ? 'sr-only' : ''}`}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 space-y-1 border-t border-border p-3">
        <div
          className={`flex items-center gap-3 rounded-lg p-2 ${
            isCollapsed ? 'justify-center' : ''
          }`}
        >
          {user?.avatarUrl ? (
            // Google avatar; the user's name sits right next to it, so empty alt
            // avoids reading the name twice.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
              {initials(user?.name)}
            </span>
          )}
          {!isCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
          )}
        </div>

        <ThemeToggle collapsed={isCollapsed} />

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          title={isCollapsed ? 'Log out' : undefined}
          aria-label="Log out"
          className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
            isCollapsed ? 'justify-center px-2' : ''
          }`}
        >
          <LogOut className="h-5 w-5 shrink-0" aria-hidden />
          {!isCollapsed && (loggingOut ? <ButtonLoader label="Signing out..." /> : <span>Log out</span>)}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar (Phase 11.2). */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation-drawer"
          className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span className="min-w-0 truncate px-3 text-sm font-semibold tracking-tight">
          {activeItem?.label ?? 'Job Tracker'}
        </span>
        <ThemeToggle collapsed />
      </header>

      {/* Mobile drawer + backdrop. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside
            id="mobile-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="absolute inset-y-0 left-0 flex w-64 animate-drawer-in flex-col border-r border-border bg-card"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-2 top-4 z-10 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            {renderNav(false, () => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {/* Desktop collapsible sidebar. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-out lg:flex ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {renderNav(collapsed)}
      </aside>
    </>
  );
}
