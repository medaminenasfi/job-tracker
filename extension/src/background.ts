import { saveJob, fetchJobs, markJobApplied, findJobByUrl, fetchMe } from './api';
import type { ApiResult, JobData } from './types';
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
        withToken((token) => saveJob(request.job as JobData, token)).then(sendResponse);
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
