'use client';

import { KanbanBoard } from '@/components/KanbanBoard';

export default function JobsPage() {
  return (
    <div className="min-w-0 p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Job Track</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your job applications</p>
      </div>
      <KanbanBoard />
    </div>
  );
}
