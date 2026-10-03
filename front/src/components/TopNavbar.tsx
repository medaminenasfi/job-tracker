'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { NAV_ITEMS } from '@/components/Sidebar';
import { NotificationMenu } from '@/components/NotificationMenu';
import { UserMenu } from '@/components/UserMenu';

type OpenMenu = 'notifications' | 'user' | null;

// Top navbar: sits to the right of the sidebar on desktop and becomes
// the fixed mobile bar on small screens. Owns the exclusive open-menu
// state so the notification popup and user dropdown never overlap.
export function TopNavbar({
  isCollapsed,
  onToggleSidebar,
  onOpenMobile,
}: {
  isCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobile: () => void;
}) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);

  const toggleMenu = (menu: Exclude<OpenMenu, null>) =>
    setOpenMenu((current) => (current === menu ? null : menu));
  const closeMenus = () => setOpenMenu(null);

  const title =
    NAV_ITEMS.find((item) =>
      item.href === '/dashboard'
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.label ?? 'Job Tracker';

  const menus = (
    <>
      <NotificationMenu
        open={openMenu === 'notifications'}
        onToggle={() => toggleMenu('notifications')}
        onClose={closeMenus}
      />
      <UserMenu
        open={openMenu === 'user'}
        onToggle={() => toggleMenu('user')}
        onClose={closeMenus}
      />
    </>
  );

  return (
    <>
      {/* Mobile top bar. */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <button
          type="button"
          onClick={onOpenMobile}
          aria-label="Open navigation menu"
          className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span className="min-w-0 truncate px-3 text-sm font-semibold tracking-tight">
          {title}
        </span>
        <div className="flex items-center gap-1">{menus}</div>
      </header>

      {/* Desktop top bar: to the right of the sidebar, never overlapping it. */}
      <header className="sticky top-0 z-30 hidden h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:flex">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isCollapsed}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-5 w-5" aria-hidden />
          ) : (
            <PanelLeftClose className="h-5 w-5" aria-hidden />
          )}
        </button>
        <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <div className="ml-auto flex items-center gap-1">{menus}</div>
      </header>
    </>
  );
}
