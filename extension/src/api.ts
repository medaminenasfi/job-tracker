import { API_BASE } from './config';
import type { ApiResult, JobData, SavedJob } from './types';

function errorResult(status: number, fallback: string): ApiResult<never> {
  if (status === 401) return { success: false, error: 'Session expired — please log in again' };
  return { success: false, error: `${fallback} (HTTP ${status})` };
}

export async function saveJob(job: JobData, token: string): Promise<ApiResult> {
  if (!job.title?.trim() || !job.company?.trim()) {
    return { success: false, error: 'Title and company are required' };
  }

  try {
    const response = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(job),
    });

    if (!response.ok) return errorResult(response.status, 'Failed to save job');
    return { success: true, data: await response.json() };
  } catch {
    return { success: false, error: 'Cannot reach the Job Tracker API' };
  }
}

export async function fetchJobs(token: string): Promise<ApiResult<SavedJob[]>> {
  try {
    const response = await fetch(`${API_BASE}/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return errorResult(response.status, 'Failed to load jobs');
    return { success: true, data: (await response.json()) as SavedJob[] };
  } catch {
    return { success: false, error: 'Cannot reach the Job Tracker API' };
  }
}

export async function markJobApplied(jobId: string, token: string): Promise<ApiResult<SavedJob>> {
  if (!jobId) return { success: false, error: 'No job selected' };
  try {
    const response = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: 'APPLIED' }),
    });
    if (!response.ok) return errorResult(response.status, 'Failed to mark as applied');
    return { success: true, data: (await response.json()) as SavedJob };
  } catch {
    return { success: false, error: 'Cannot reach the Job Tracker API' };
  }
}

function normalizeUrl(url?: string | null): string {
  if (!url) return '';
  return url.replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();
}

// Match a saved job to a page URL, ignoring query/hash/trailing-slash noise.
export function findJobByUrl(jobs: SavedJob[], url: string): SavedJob | undefined {
  const target = normalizeUrl(url);
  if (!target) return undefined;
  return jobs.find((job) => normalizeUrl(job.url) === target);
}

