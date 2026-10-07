'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  BarChart3,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import sidebarLogo from '@/assest/Logo_minimaliste_AT_avec_swoosh-removebg-preview.png';
import { ButtonLoader } from '@/components/ui/Loading';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/jobs', label: 'Job Track', icon: Briefcase },
  { href: '/dashboard/profile', label: 'Profile', icon: User },
  { href: '/cv-builder', label: 'CV Builder', icon: FileText },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/companies', label: 'Companies', icon: Building2 },
  { href: '/dashboard/settings', label: 'Parameters', icon: Settings },
];

export const NAV_ITEMS = navItems;

const COLLAPSE_KEY = 'jt_sidebar_collapsed';

function isRouteActive(pathname: string, href: string) {
  return href === '/dashboard'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

type SidebarProps = {
  // Controlled mode (DashboardGuard owns the state). When omitted the
  // sidebar manages collapse itself and persists it to localStorage.
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

// Collapsible sidebar with nested active routes, staggered nav fade-in,
// tooltips when icon-only, and a mobile/tablet slide-in drawer.
export function Sidebar({
  isCollapsed: isCollapsedProp,
  onToggleCollapse,
  mobileOpen: mobileOpenProp,
  onCloseMobile,
}: SidebarProps = {}) {
  const pathname = usePathname();
  const { logout } = useAuth();

  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const controlled = isCollapsedProp !== undefined;
  const isCollapsed = controlled ? isCollapsedProp : internalCollapsed;
  const toggleCollapsed = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => {
        const next = !prev;
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
        return next;
      });
    }
  };

  const controlledMobile = mobileOpenProp !== undefined;
  const mobileOpen = controlledMobile ? mobileOpenProp : internalMobileOpen;
  const closeMobile = () => {
    if (onCloseMobile) onCloseMobile();
    else setInternalMobileOpen(false);
  };

  // Restore the desktop collapse state after hydration (SSR always renders
  // wide). Only in uncontrolled mode — a controlled parent owns the state.
  useEffect(() => {
    if (!controlled) setInternalCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, [controlled]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  // Mobile drawer: closes on navigation, on Escape, and locks body scroll.
  const lastPathname = useRef(pathname);
  useEffect(() => {
    if (lastPathname.current !== pathname) {
      lastPathname.current = pathname;
      closeMobile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobile();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {/* Mobile drawer + backdrop. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/50"
            onClick={closeMobile}
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
              onClick={closeMobile}
              aria-label="Close navigation menu"
              className="absolute right-2 top-4 z-10 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            {renderNav(false, closeMobile)}
          </aside>
        </div>
      )}

      {/* Desktop collapsible sidebar. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-out lg:flex ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {renderNav(isCollapsed)}
      </aside>
    </>
  );
}
