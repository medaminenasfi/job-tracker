'use client';

import { MapPin } from 'lucide-react';
import { useRef } from 'react';
import { Job } from '@/lib/types';

interface JobCardProps {
  job: Job;
  onViewDetails?: () => void;
  isDragging?: boolean;
}

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
      className={`group cursor-pointer rounded-lg border border-border bg-card p-4 shadow-card transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring ${
        isDragging
          ? 'pointer-events-none opacity-0'
          : 'hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-card-hover'
      }`}
    >
      <h3 className="mb-1 line-clamp-2 font-semibold text-foreground">{job.title}</h3>
      <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">{job.company}</p>

      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        {job.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {job.location}
          </span>
        )}
        {job.source && <span>• {job.source}</span>}
      </div>

      {job.applied_at && (
        <div className="text-xs text-muted-foreground">
          Applied: {new Date(job.applied_at).toLocaleDateString()}
        </div>
      )}

      {onViewDetails && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails();
          }}
          className="mt-2 text-xs text-accent hover:text-accent-hover font-medium"
        >
          View Details
        </button>
      )}
    </div>
  );
}
