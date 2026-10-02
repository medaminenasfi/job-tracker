'use client';

import { KanbanBoard } from '@/components/KanbanBoard';
import { Briefcase, Sparkles } from 'lucide-react';

export default function JobsPage() {
  return (
    <div className="min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Briefcase className="h-4 w-4" aria-hidden />
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Job Applications
            </h1>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Organize, prioritize and track your application pipeline across all stages.
          </p>
        </div>

        <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <span>Drag cards between columns to update status</span>
        </div>
      </div>

      <KanbanBoard />
    </div>
  );
}
