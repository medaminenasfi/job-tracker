'use client';

import { Job } from '@/lib/types';

interface JobCardProps {
  job: Job;
}

export function JobCard({ job }: JobCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
      <h3 className="font-semibold text-black mb-1">{job.title}</h3>
      <p className="text-sm text-gray-600 mb-2">{job.company}</p>
      
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
        {job.location && <span>📍 {job.location}</span>}
        {job.source && <span>• {job.source}</span>}
      </div>

      {job.salary && (
        <div className="text-xs font-medium text-green-700 bg-green-50 inline-block px-2 py-1 rounded mb-2">
          {job.salary}
        </div>
      )}

      {job.applied_at && (
        <div className="text-xs text-gray-500">
          Applied: {new Date(job.applied_at).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
