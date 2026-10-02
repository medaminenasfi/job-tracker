'use client';

import { MapPin, Calendar, DollarSign, Building2, ExternalLink } from 'lucide-react';
import { useRef } from 'react';
import { Job } from '@/lib/types';

interface JobCardProps {
  job: Job;
  onViewDetails?: () => void;
  isDragging?: boolean;
}

const SOURCE_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  linkedin: { label: 'LinkedIn', bg: 'bg-[#0077b5]/10 dark:bg-[#0077b5]/20', text: 'text-[#0077b5] dark:text-[#38a0dc]' },
  indeed: { label: 'Indeed', bg: 'bg-[#2164f3]/10 dark:bg-[#2164f3]/20', text: 'text-[#2164f3] dark:text-[#5a8bf7]' },
  manual: { label: 'Manual', bg: 'bg-muted', text: 'text-muted-foreground' },
  generic: { label: 'Web', bg: 'bg-accent/10', text: 'text-accent' },
};

export function JobCard({ job, onViewDetails, isDragging = false }: JobCardProps) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onViewDetails) return;
    const start = pointerStart.current;
    const moved = start
      ? Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
      : false;
    pointerStart.current = null;
    if (!moved) onViewDetails();
  };

  const sourceKey = (job.source || 'manual').toLowerCase();
  const sourceBadge = SOURCE_BADGES[sourceKey] ?? {
    label: job.source || 'Job',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
  };

  return (
    <div
      role={onViewDetails ? 'article' : undefined}
      tabIndex={onViewDetails ? 0 : undefined}
      aria-label={onViewDetails ? `Open details for ${job.title}` : undefined}
      onPointerDown={(event) => {
        pointerStart.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (onViewDetails && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onViewDetails();
        }
      }}
      className={`group relative rounded-xl border border-border bg-card p-3.5 shadow-card transition-all duration-200 select-none focus:outline-none focus:ring-2 focus:ring-ring ${
        isDragging
          ? 'pointer-events-none opacity-0'
          : 'hover:-translate-y-1 hover:border-accent/40 hover:shadow-card-hover'
      }`}
    >
      {/* Top Header: Source badge + quick link indicator */}
      <div className="mb-2 flex items-center justify-between gap-1.5">
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${sourceBadge.bg} ${sourceBadge.text}`}
        >
          {sourceBadge.label}
        </span>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open original job link"
            className="rounded p-1 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 hover:text-accent"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Job Title */}
      <h3 className="line-clamp-2 text-sm font-bold text-foreground transition-colors group-hover:text-accent">
        {job.title}
      </h3>

      {/* Company Name */}
      <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="truncate">{job.company}</span>
      </div>

      {/* Metadata tags: Location & Salary */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {job.location && (
          <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[120px]">{job.location}</span>
          </span>
        )}
        {job.salary && (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
            <DollarSign className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[110px]">{job.salary}</span>
          </span>
        )}
      </div>

      {/* Footer: Date applied or saved + View Details affordance */}
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0 opacity-60" />
          <span>
            {job.applied_at
              ? `Applied ${new Date(job.applied_at).toLocaleDateString()}`
              : job.saved_at
              ? `Saved ${new Date(job.saved_at).toLocaleDateString()}`
              : 'Recently'}
          </span>
        </div>

        {onViewDetails && (
          <button
            type="button"
            aria-label="View Details"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
            className="text-[11px] font-semibold text-accent transition-colors hover:text-accent-hover hover:underline"
          >
            View Details
          </button>
        )}
      </div>
    </div>
  );
}
