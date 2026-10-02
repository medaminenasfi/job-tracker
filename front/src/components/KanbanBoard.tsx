'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, useDroppable, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, sortableKeyboardCoordinates, defaultAnimateLayoutChanges, AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Job, JobStatus } from '@/lib/types';
import { DEFAULT_STATUS_NAMES, statusLabel, useJobStatuses } from '@/lib/useJobStatuses';
import { JobCard } from './JobCard';
import { AddJobModal } from './AddJobModal';
import { JobDetailsModal } from './JobDetailsModal';
import { Toast, useToast } from './Toast';
import { Skeleton } from './Skeleton';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Per-column tints with matching dark-mode variants (Phase 11.3).
const COLUMN_COLORS: Record<JobStatus, string> = {
  SAVED: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900',
  APPLIED: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-900',
  ACCEPTED: 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-900',
  INTERVIEW: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900',
  OFFER: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900',
  REJECTED: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900',
  WITHDRAWN: 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800',
};

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

function SortableJobCard({ job, onViewDetails }: { job: Job; onViewDetails: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
    animateLayoutChanges,
    transition: {
      duration: 250,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing transition-opacity duration-200 ${
        isDragging ? 'pointer-events-none scale-[0.98]' : ''
      }`}
    >
      <JobCard job={job} onViewDetails={onViewDetails} isDragging={isDragging} />
    </div>
  );
}

function DroppableColumn({ status, children, className }: { status: JobStatus; children: React.ReactNode; className: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div
      ref={setNodeRef}
      id={`column-${status}`}
      className={`${className} transition-all duration-200 ${
        isOver ? 'ring-2 ring-inset ring-accent bg-accent/5 dark:bg-accent/10 shadow-md' : ''
      }`}
    >
      {children}
    </div>
  );
}

export function KanbanBoard() {
  const queryClient = useQueryClient();
  const { toast, showToast, hideToast } = useToast();
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | '7days' | '30days' | '90days'>('ALL');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { data: statusConfigs, isLoading: statusesLoading } = useJobStatuses();
  const columns: JobStatus[] = statusConfigs?.map((status) => status.name) ?? DEFAULT_STATUS_NAMES;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    // Keyboard drag-and-drop (Phase 11.4) — Space picks up, arrows move.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: jobs = [], isLoading, isError } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await apiFetch('/api/jobs');
      if (!res.ok) throw new Error('Failed to fetch jobs');
      return res.json() as Promise<Job[]>;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ jobId, status }: { jobId: string; status: JobStatus }) => {
      const res = await apiFetch(`/api/jobs/${jobId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      return res.json() as Promise<Job>;
    },
    onMutate: async ({ jobId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['jobs'] });
      
      const previousJobs = queryClient.getQueryData(['jobs']) as Job[];
      
      queryClient.setQueryData(['jobs'], (old: Job[] = []) =>
        old.map((job) => (job.id === jobId ? { ...job, status } : job))
      );
      
      return { previousJobs };
    },
    onError: (error, variables, context) => {
      if (context?.previousJobs) {
        queryClient.setQueryData(['jobs'], context.previousJobs);
      }
      showToast('Failed to update status', 'error');
    },
    onSuccess: (_data, variables) => {
      showToast(`Moved to ${variables.status}`, 'success');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const job = jobs.find((j) => j.id === event.active.id);
    if (job) setActiveJob(job);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveJob(null);

    if (!over) return;

    const jobId = active.id as string;
    const overId = over.id as string;

    const job = jobs.find((j) => j.id === jobId);
    const overJob = jobs.find((j) => j.id === overId);

    if (!job) return;

    if (overJob && overJob.status !== job.status) {
      updateStatusMutation.mutate({ jobId, status: overJob.status });
      return;
    }

    if (columns.includes(overId as JobStatus) && overId !== job.status) {
      updateStatusMutation.mutate({ jobId, status: overId as JobStatus });
    }
  };

  if (isLoading || statusesLoading) {
    // Skeleton columns shaped like the real board (Phase 11.3).
    return (
      <div role="status" aria-label="Loading jobs" className="flex max-w-full gap-4 overflow-x-auto pb-2">
        {columns.map((status) => (
          <div
            key={status}
            className="w-[min(18rem,calc(100vw-2rem))] shrink-0 rounded-lg border border-border bg-card p-3"
          >
            <Skeleton className="mb-3 h-4 w-20" />
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        ))}
        <span className="sr-only">Loading jobs…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-red-600" role="alert">
        Failed to load jobs. Check your connection and try again.
      </div>
    );
  }

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      searchQuery === '' ||
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (job.location && job.location.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'ALL' || job.status === statusFilter;
    const matchesSource = sourceFilter === 'ALL' || job.source === sourceFilter;
    
    let matchesDate = true;
    if (dateFilter !== 'ALL' && job.saved_at) {
      const jobDate = new Date(job.saved_at);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - jobDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (dateFilter === '7days') {
        matchesDate = daysDiff <= 7;
      } else if (dateFilter === '30days') {
        matchesDate = daysDiff <= 30;
      } else if (dateFilter === '90days') {
        matchesDate = daysDiff <= 90;
      }
    }
    
    return matchesSearch && matchesStatus && matchesSource && matchesDate;
  });

  const jobsByColumn = columns.reduce((acc, status) => {
    acc[status] = filteredJobs.filter((j) => j.status === status);
    return acc;
  }, {} as Record<JobStatus, Job[]>);

  const stats = {
    total: jobs.length,
    applied: jobs.filter((j) => j.status === 'APPLIED').length,
    interviews: jobs.filter((j) => j.status === 'INTERVIEW').length,
    offers: jobs.filter((j) => j.status === 'OFFER').length,
  };

  return (
    <div className="space-y-6">
      {/* Top Controls: Metrics Row + Add Job Action */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2 shadow-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent font-bold text-xs">
              ∑
            </span>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total</div>
              <div className="text-base font-extrabold text-foreground tabular-nums leading-none mt-0.5">{stats.total}</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-amber-200/60 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/30 px-3.5 py-2 shadow-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold text-xs">
              ⚡
            </span>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Applied</div>
              <div className="text-base font-extrabold text-amber-700 dark:text-amber-300 tabular-nums leading-none mt-0.5">{stats.applied}</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-green-200/60 dark:border-green-900/60 bg-green-50/50 dark:bg-green-950/30 px-3.5 py-2 shadow-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/15 text-green-700 dark:text-green-300 font-bold text-xs">
              💬
            </span>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Interviews</div>
              <div className="text-base font-extrabold text-green-700 dark:text-green-300 tabular-nums leading-none mt-0.5">{stats.interviews}</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 px-3.5 py-2 shadow-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
              🎉
            </span>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Offers</div>
              <div className="text-base font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums leading-none mt-0.5">{stats.offers}</div>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-hover hover:shadow-lg hover:scale-[1.01]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          <span>Add Application</span>
        </button>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_160px_150px_150px]">
        <input
          type="text"
          placeholder="Search company, title, or location..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-w-0 w-full rounded-xl border border-input bg-card px-3.5 py-2 text-sm text-foreground shadow-sm transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as JobStatus | 'ALL')}
          className="min-w-0 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
        >
          <option value="ALL">All Statuses</option>
          {columns.map((status) => (
            <option key={status} value={status}>{statusLabel(status)}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="min-w-0 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
        >
          <option value="ALL">All Sources</option>
          <option value="linkedin">LinkedIn</option>
          <option value="indeed">Indeed</option>
          <option value="manual">Manual</option>
          <option value="generic">Generic</option>
        </select>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as 'ALL' | '7days' | '30days' | '90days')}
          className="min-w-0 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
        >
          <option value="ALL">All Time</option>
          <option value="7days">Last 7 days</option>
          <option value="30days">Last 30 days</option>
          <option value="90days">Last 90 days</option>
        </select>
      </div>

      {filteredJobs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
          {jobs.length === 0
            ? 'No applications yet — click "+ Add Application" to start your pipeline.'
            : 'No applications match your active search and filter criteria.'}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex max-w-full gap-4 overflow-x-auto pb-4 pt-1">
          {columns.map((status) => (
            <DroppableColumn
              key={status}
              status={status}
              className={`w-[min(19rem,calc(100vw-2.5rem))] shrink-0 ${COLUMN_COLORS[status] ?? 'bg-muted border-border'} rounded-2xl border p-3.5 shadow-sm transition-all`}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-foreground text-sm tracking-tight">{statusLabel(status)}</h3>
                </div>
                <span className="text-xs font-bold text-muted-foreground bg-card/90 px-2 py-0.5 rounded-full shadow-sm tabular-nums">
                  {jobsByColumn[status].length}
                </span>
              </div>
              <SortableContext items={jobsByColumn[status].map((j) => j.id)}>
                <div className="space-y-2.5 min-h-[140px]">
                  {jobsByColumn[status].length === 0 && (
                    <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/50 px-3 text-center text-xs text-muted-foreground">
                      <span className="opacity-50">Drop here</span>
                    </div>
                  )}
                  {jobsByColumn[status].map((job) => (
                    <SortableJobCard 
                      key={job.id} 
                      job={job} 
                      onViewDetails={() => setSelectedJob(job)} 
                    />
                  ))}
                </div>
              </SortableContext>
            </DroppableColumn>
          ))}
        </div>

        {isMounted &&
          createPortal(
            <DragOverlay
              dropAnimation={{
                duration: 200,
                easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
              }}
            >
              {activeJob ? (
                <div className="w-[calc(min(19rem,calc(100vw-2.5rem))-1.75rem)] cursor-grabbing rotate-[1.5deg] scale-[1.02] rounded-xl shadow-2xl ring-2 ring-accent transition-transform select-none">
                  <JobCard job={activeJob} />
                </div>
              ) : null}
            </DragOverlay>,
            document.body
          )}
      </DndContext>

      <AddJobModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      <JobDetailsModal 
        job={selectedJob} 
        isOpen={!!selectedJob} 
        onClose={() => setSelectedJob(null)} 
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
