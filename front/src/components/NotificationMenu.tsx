'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { apiJson } from '@/lib/api';
import { ButtonLoader } from '@/components/ui/Loading';

type Notification = {
  id: string;
  jobId: string | null;
  type: string;
  body: string;
  read: boolean;
  createdAt: string;
};

// Notification bell + dropdown for the top navbar. `open`/`onClose`
// are owned by TopNavbar so only one popover is ever open.
export function NotificationMenu({
  open,
  onToggle,
  onClose,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => apiJson('/api/notifications'),
    refetchInterval: 60000,
  });
  const unread = notifications.filter((n) => !n.read).length;

  const readMutation = useMutation({
    mutationFn: (id: string) =>
      apiJson(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readAllMutation = useMutation({
    mutationFn: () =>
      apiJson('/api/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-2 shadow-lg"
        >
          <div className="flex items-center justify-between px-3 py-2">
            <h2 className="text-sm font-semibold text-foreground">
              Notifications
            </h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => readAllMutation.mutate()}
                disabled={readAllMutation.isPending}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                Mark all as read
              </button>
            )}
          </div>

          <ul className="max-h-80 overflow-y-auto">
            {isLoading && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                <ButtonLoader label="Loading..." />
              </li>
            )}
            {!isLoading && notifications.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                No notifications yet.
              </li>
            )}
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => !n.read && readMutation.mutate(n.id)}
                  className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                    n.read
                      ? 'text-muted-foreground hover:bg-muted'
                      : 'bg-accent/5 text-foreground hover:bg-accent/10'
                  }`}
                >
                  <span className="min-w-0 break-words text-sm">
                    {n.body}
                  </span>
                  {!n.read && (
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                      aria-label="Unread"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>

          <Link
            href="/dashboard/notifications"
            role="menuitem"
            onClick={onClose}
            className="mt-1 block rounded-md border-t border-border px-3 py-2 text-center text-xs font-medium text-accent transition-colors hover:bg-muted"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
