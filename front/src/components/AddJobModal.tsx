'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { JobStatus } from '@/lib/types';

interface AddJobModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddJobModal({ isOpen, onClose }: AddJobModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    title: '',
    company: '',
    location: '',
    url: '',
    source: 'manual',
    description: '',
    salary: '',
    employment_type: '',
    status: 'SAVED' as JobStatus,
    notes: '',
  });

  const createJobMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiFetch('/api/jobs', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create job');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      onClose();
      setFormData({
        title: '',
        company: '',
        location: '',
        url: '',
        source: 'manual',
        description: '',
        salary: '',
        employment_type: '',
        status: 'SAVED',
        notes: '',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createJobMutation.mutate(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-black">Add Job</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-black mb-1">Title *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
              placeholder="Software Engineer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Company *</label>
            <input
              type="text"
              required
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
              placeholder="San Francisco, CA"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">URL</label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
              placeholder="https://example.com/job"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Salary</label>
            <input
              type="text"
              value={formData.salary}
              onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
              placeholder="$120,000 - $150,000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as JobStatus })}
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

          <div>
            <label className="block text-sm font-medium text-black mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
              rows={3}
              placeholder="Job description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-black focus:outline-none focus:border-black"
              rows={2}
              placeholder="Personal notes..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-black hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createJobMutation.isPending}
              className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {createJobMutation.isPending ? 'Adding...' : 'Add Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
