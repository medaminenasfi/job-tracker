import { saveJob, fetchJobs, markJobApplied, findJobByUrl, fetchMe, createNote } from './api';
import type { ApiResult, JobData, SavedJob } from './types';
import type { RuntimeMessage } from './messages';

function getToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken'], (result) =>
      resolve((result.authToken as string | undefined) ?? null),
    );
  });
}

async function withToken(fn: (token: string) => Promise<ApiResult>): Promise<ApiResult> {
  const token = await getToken();
  if (!token) return { success: false, error: 'Not logged in' };
  return fn(token);
}

// Auto-detection: resolve the saved job for this page URL, then flip it to APPLIED.
// applied_at is set server-side by PATCH /jobs/:id/status.
async function handleApplicationDetected(url?: string): Promise<ApiResult> {
  return withToken(async (token) => {
    if (!url) return { success: false, error: 'No page URL' };
    const jobsResult = await fetchJobs(token);
    if (!jobsResult.success || !jobsResult.data) {
      return { success: false, error: jobsResult.error };
    }
    const job = findJobByUrl(jobsResult.data, url);
    if (!job) return { success: false, error: 'No saved job matches this page' };
    if (job.status === 'APPLIED') return { success: true, data: job };
    return markJobApplied(job.id, token);
  });
}

// Save the job, then attach the optional note as the job's first managed note.
// The note is stripped from the create payload so it lives only in job_notes (the
// same store the dashboard manages) rather than the legacy jobs.notes column.
// A note failure never fails the save — the job is already persisted.
async function handleSaveJob(job: JobData, token: string): Promise<ApiResult> {
  const { notes, ...jobWithoutNotes } = job;
  const saved = await saveJob(jobWithoutNotes, token);
  if (!saved.success || !saved.data) return saved;

  const body = notes?.trim();
  const jobId = (saved.data as SavedJob).id;
  if (body && jobId) {
    const noteResult = await createNote(jobId, body, token);
    if (!noteResult.success) {
      console.warn('Job saved but note failed:', noteResult.error);
    }
  }
  return saved;
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Job Tracker extension installed');
});

chrome.runtime.onMessage.addListener(
  (request: RuntimeMessage, _sender, sendResponse) => {
    switch (request.type) {
      case 'GET_TOKEN':
        getToken().then((token) => sendResponse({ token }));
        return true;

      case 'SET_TOKEN':
        chrome.storage.local.set({ authToken: request.token }, () => sendResponse({ success: true }));
        return true;

      case 'LOGOUT':
        // The extension only holds the access token (no refresh cookie), so
        // clearing local storage fully signs it out.
        chrome.storage.local.remove('authToken', () => sendResponse({ success: true }));
        return true;

      case 'GET_ME':
        withToken((token) => fetchMe(token)).then(sendResponse);
        return true;

      case 'SAVE_JOB':
        withToken((token) => handleSaveJob(request.job as JobData, token)).then(sendResponse);
        return true;

      case 'GET_JOBS':
        withToken((token) => fetchJobs(token)).then(sendResponse);
        return true;

      case 'MARK_APPLIED':
        withToken((token) => markJobApplied(request.jobId ?? '', token)).then(sendResponse);
        return true;

      case 'APPLICATION_DETECTED':
        handleApplicationDetected(request.url).then(sendResponse);
        return true;
    }
  },
);
