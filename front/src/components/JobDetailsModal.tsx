'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Job, JobStatus } from '@/lib/types';

interface JobDetailsModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
}

export function JobDetailsModal({ job, isOpen, onClose }: JobDetailsModalProps) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(job?.notes || '');
  const [status, setStatus] = useState<JobStatus>(job?.status || 'SAVED');

  const updateJobMutation = useMutation({
    mutationFn: async (data: { notes?: string; status?: JobStatus }) => {
      const res = await apiFetch(`/api/jobs/${job?.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update job');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/jobs/${job?.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete job');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      onClose();
    },
  });

  const handleSaveNotes = () => {
    updateJobMutation.mutate({ notes });
  };

  const handleStatusChange = (newStatus: JobStatus) => {
    setStatus(newStatus);
    updateJobMutation.mutate({ status: newStatus });
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this job?')) {
      deleteJobMutation.mutate();
    }
  };

  if (!isOpen || !job) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-black">{job.title}</h2>
            <p className="text-gray-600">{job.company}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Location</label>
              <p className="text-black">{job.location || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Salary</label>
              <p className="text-black">{job.salary || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Source</label>
              <p className="text-black">{job.source || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Employment Type</label>
              <p className="text-black">{job.employment_type || 'N/A'}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value as JobStatus)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
            >
              <option value="SAVED">Saved</option>
              <option value="APPLIED">Applied</option>
              <option value="SCREENING">Screening</option>
              <option value="INTERVIEW">Interview</option>
              <option value="OFFER">Offer</option>
              <option value="REJECTED">Rejected</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </select>
          </div>

          {job.description && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Description</label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-black max-h-48 overflow-y-auto">
                {job.description}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
              rows={4}
              placeholder="Add your notes..."
            />
            <button
              onClick={handleSaveNotes}
              disabled={updateJobMutation.isPending}
              className="mt-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors text-sm"
            >
              {updateJobMutation.isPending ? 'Saving...' : 'Save Notes'}
            </button>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Open Original Job
              </a>
            )}
            <button
              onClick={handleDelete}
              disabled={deleteJobMutation.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
            >
              {deleteJobMutation.isPending ? 'Deleting...' : 'Delete Job'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
