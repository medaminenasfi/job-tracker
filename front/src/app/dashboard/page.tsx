'use client';

import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Job, JobStatus } from '@/lib/types';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await apiFetch('/api/jobs');
      if (!res.ok) throw new Error('Failed to fetch jobs');
      return res.json() as Promise<Job[]>;
    },
  });

  const stats = {
    total: jobs.length,
    saved: jobs.filter((j) => j.status === 'SAVED').length,
    applied: jobs.filter((j) => j.status === 'APPLIED').length,
    screening: jobs.filter((j) => j.status === 'SCREENING').length,
    interview: jobs.filter((j) => j.status === 'INTERVIEW').length,
    offer: jobs.filter((j) => j.status === 'OFFER').length,
    rejected: jobs.filter((j) => j.status === 'REJECTED').length,
    withdrawn: jobs.filter((j) => j.status === 'WITHDRAWN').length,
  };

  const recentJobs = jobs.slice(0, 5);

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome back, {user?.name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="text-3xl font-bold text-black">{stats.total}</div>
          <div className="text-sm text-gray-500 mt-1">Total Jobs</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="text-3xl font-bold text-blue-600">{stats.applied}</div>
          <div className="text-sm text-gray-500 mt-1">Applied</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="text-3xl font-bold text-green-600">{stats.interview}</div>
          <div className="text-sm text-gray-500 mt-1">Interviews</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="text-3xl font-bold text-emerald-600">{stats.offer}</div>
          <div className="text-sm text-gray-500 mt-1">Offers</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-bold text-black mb-4">Status Breakdown</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Saved</span>
              <span className="font-medium text-black">{stats.saved}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Applied</span>
              <span className="font-medium text-black">{stats.applied}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Screening</span>
              <span className="font-medium text-black">{stats.screening}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Interview</span>
              <span className="font-medium text-black">{stats.interview}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Offer</span>
              <span className="font-medium text-black">{stats.offer}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Rejected</span>
              <span className="font-medium text-black">{stats.rejected}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Withdrawn</span>
              <span className="font-medium text-black">{stats.withdrawn}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-bold text-black mb-4">Recent Jobs</h2>
          {recentJobs.length === 0 ? (
            <p className="text-gray-500 text-sm">No jobs yet. Start adding jobs!</p>
          ) : (
            <div className="space-y-3">
              {recentJobs.map((job) => (
                <div key={job.id} className="border-b border-gray-100 pb-3 last:border-0">
                  <div className="font-medium text-black">{job.title}</div>
                  <div className="text-sm text-gray-600">{job.company}</div>
                  <div className="text-xs text-gray-500 mt-1">{job.status}</div>
                </div>
              ))}
            </div>
          )}
          {recentJobs.length > 0 && (
            <Link
              href="/dashboard/jobs"
              className="block mt-4 text-sm text-blue-600 hover:text-blue-700"
            >
              View all jobs →
            </Link>
          )}
        </div>
      </div>

      {stats.total === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-800 mb-4">You haven't added any jobs yet.</p>
          <Link
            href="/dashboard/jobs"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Job Track
          </Link>
        </div>
      )}
    </div>
  );
}
