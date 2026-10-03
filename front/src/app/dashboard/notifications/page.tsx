'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Bell } from 'lucide-react';
import { apiJson } from '@/lib/api';
import { SectionLoader } from '@/components/ui/Loading';

type Notification = {
  id: string;
  jobId: string | null;
  type: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => apiJson('/api/notifications'),
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

  if (isLoading) return <SectionLoader label="Loading notifications..." />;

  return (
    <div className="min-w-0 p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {unread > 0 ? `${unread} unread` : 'All caught up'}
          </p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => readAllMutation.mutate()}
            disabled={readAllMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:brightness-110 disabled:opacity-50 text-sm"
          >
            <CheckCheck className="h-4 w-4" aria-hidden />
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-3" aria-hidden />
          <p className="text-muted-foreground">No notifications yet.</p>
          <p className="text-muted-foreground text-sm mt-1">
            Follow-up reminders for applied jobs will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => !n.read && readMutation.mutate(n.id)}
                className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                  n.read
                    ? 'border-border bg-card text-muted-foreground'
                    : 'border-accent/40 bg-accent/5 text-foreground hover:border-accent'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm break-words">{n.body}</p>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                  )}
                </div>
                <time className="block mt-1 text-xs text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString()}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
