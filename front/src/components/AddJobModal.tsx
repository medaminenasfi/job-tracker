'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { JobStatus } from '@/lib/types';
import { ButtonLoader } from '@/components/ui/Loading';
import { DEFAULT_STATUS_NAMES, statusLabel, useJobStatuses } from '@/lib/useJobStatuses';

interface AddJobModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddJobModal({ isOpen, onClose }: AddJobModalProps) {
  const queryClient = useQueryClient();
  const { data: statusConfigs } = useJobStatuses();
  const statuses = statusConfigs?.map((status) => status.name) ?? DEFAULT_STATUS_NAMES;
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

  // Escape closes the dialog (Phase 11.4 keyboard support).
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-job-title"
        className="bg-card border border-border rounded-xl shadow-card-hover w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-pop-in"
      >
        <div className="p-6 border-b border-border">
          <h2 id="add-job-title" className="text-xl font-bold text-foreground">Add Job</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Title *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
              placeholder="Software Engineer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Company *</label>
            <input
              type="text"
              required
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
              placeholder="San Francisco, CA"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">URL</label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
              placeholder="https://example.com/job"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Salary</label>
            <input
              type="text"
              value={formData.salary}
              onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
              className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
              placeholder="$120,000 - $150,000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as JobStatus })}
              className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
            >
              {statuses.map((status) => (
                <option key={status} value={status}>{statusLabel(status)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
              rows={3}
              placeholder="Job description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full border border-input rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-ring"
              rows={2}
              placeholder="Personal notes..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-input rounded-lg text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createJobMutation.isPending}
              className="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {createJobMutation.isPending ? <ButtonLoader label="Adding..." /> : 'Add Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
