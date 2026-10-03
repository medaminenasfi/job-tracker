'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ButtonLoader } from '@/components/ui/Loading';

function initials(name?: string) {
  return (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

// User/avatar dropdown for the top navbar. `open`/`onClose` are owned by
// TopNavbar so only one popover (notifications or user) is ever open.
export function UserMenu({
  open,
  onToggle,
  onClose,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Open user menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {user?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
            {initials(user?.name)}
          </span>
        )}
        <span className="hidden max-w-32 truncate text-sm font-medium md:block">
          {user?.name ?? 'Account'}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="User menu"
          className="absolute right-0 top-11 z-50 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-2 shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium text-foreground">
              {user?.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email}
            </p>
          </div>
          <a
            href="/dashboard/profile"
            role="menuitem"
            onClick={onClose}
            className="block rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            Profile
          </a>
          <a
            href="/dashboard/settings"
            role="menuitem"
            onClick={onClose}
            className="block rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            Settings
          </a>
          <div className="my-1 border-t border-border" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            {loggingOut ? <ButtonLoader label="Signing out..." /> : 'Log out'}
          </button>
        </div>
      )}
    </div>
  );
}
