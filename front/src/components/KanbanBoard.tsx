'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiFetch } from '@/lib/api';
import { Job, JobStatus } from '@/lib/types';
import { JobCard } from './JobCard';
import { AddJobModal } from './AddJobModal';
import { JobDetailsModal } from './JobDetailsModal';
import { Toast, useToast } from './Toast';
import { useState } from 'react';

const COLUMNS: JobStatus[] = ['SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'];

const COLUMN_COLORS: Record<JobStatus, string> = {
  SAVED: 'bg-blue-50 border-blue-200',
  APPLIED: 'bg-yellow-50 border-yellow-200',
  SCREENING: 'bg-purple-50 border-purple-200',
  INTERVIEW: 'bg-green-50 border-green-200',
  OFFER: 'bg-emerald-50 border-emerald-200',
  REJECTED: 'bg-red-50 border-red-200',
  WITHDRAWN: 'bg-gray-50 border-gray-200',
};

function SortableJobCard({ job, onViewDetails }: { job: Job; onViewDetails: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
    >
      <JobCard job={job} onViewDetails={onViewDetails} />
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
      className={`${className} ${isOver ? 'ring-2 ring-black' : ''}`}
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
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

    if (COLUMNS.includes(overId as JobStatus) && overId !== job.status) {
      updateStatusMutation.mutate({ jobId, status: overId as JobStatus });
    }
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading jobs...</div>;
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

  const jobsByColumn = COLUMNS.reduce((acc, status) => {
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
    <div>
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-6">
          <div className="text-sm">
            <span className="font-bold text-black">{stats.total}</span>
            <span className="text-gray-500 ml-1">Total</span>
          </div>
          <div className="text-sm">
            <span className="font-bold text-black">{stats.applied}</span>
            <span className="text-gray-500 ml-1">Applied</span>
          </div>
          <div className="text-sm">
            <span className="font-bold text-black">{stats.interviews}</span>
            <span className="text-gray-500 ml-1">Interviews</span>
          </div>
          <div className="text-sm">
            <span className="font-bold text-black">{stats.offers}</span>
            <span className="text-gray-500 ml-1">Offers</span>
          </div>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          + Add Job
        </button>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <input
          type="text"
          placeholder="Search jobs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as JobStatus | 'ALL')}
          className="border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
        >
          <option value="ALL">All Statuses</option>
          <option value="SAVED">Saved</option>
          <option value="APPLIED">Applied</option>
          <option value="SCREENING">Screening</option>
          <option value="INTERVIEW">Interview</option>
          <option value="OFFER">Offer</option>
          <option value="REJECTED">Rejected</option>
          <option value="WITHDRAWN">Withdrawn</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
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
          className="border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
        >
          <option value="ALL">All Time</option>
          <option value="7days">Last 7 days</option>
          <option value="30days">Last 30 days</option>
          <option value="90days">Last 90 days</option>
        </select>
      </div>

      {filteredJobs.length === 0 && (
        <div className="mb-4 text-sm text-gray-500">
          {jobs.length === 0
            ? 'No jobs yet — click "+ Add Job" to get started.'
            : 'No jobs match your search or filters.'}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((status) => (
            <DroppableColumn
              key={status}
              status={status}
              className={`flex-shrink-0 w-72 ${COLUMN_COLORS[status]} border rounded-lg p-3`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-black text-sm">{status}</h3>
                <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full">
                  {jobsByColumn[status].length}
                </span>
              </div>
              <SortableContext items={jobsByColumn[status].map((j) => j.id)}>
                <div className="space-y-2 min-h-[100px]">
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

        <DragOverlay>
          {activeJob ? <JobCard job={activeJob} /> : null}
        </DragOverlay>
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
