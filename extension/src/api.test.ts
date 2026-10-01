import { describe, it, expect, vi, afterEach } from 'vitest';
import { saveJob, fetchJobs, markJobApplied, findJobByUrl, fetchMe, createNote } from './api';
import { API_BASE } from './config';
import type { SavedJob, User } from './types';

const job = { title: 'Engineer', company: 'Acme', source: 'manual' as const };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveJob', () => {
  it('posts the job with the bearer token and returns the created row', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'job-1', ...job }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveJob(job, 'token-123');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
      body: JSON.stringify(job),
    });
    vi.unstubAllGlobals();
  });

  it('rejects a job missing title or company without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveJob({ title: '  ', company: 'Acme' }, 'token');

    expect(result).toEqual({ success: false, error: 'Title and company are required' });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('includes the note in the request body when provided', async () => {
    const withNote = { ...job, notes: 'Referred by Sam' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'job-2', ...withNote }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveJob(withNote, 'token-123');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
      body: JSON.stringify(withNote),
    });
    vi.unstubAllGlobals();
  });

  it('reports an expired session on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    const result = await saveJob(job, 'bad-token');
    expect(result).toEqual({ success: false, error: 'Session expired — please log in again' });
    vi.unstubAllGlobals();
  });

  it('reports a network failure gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await saveJob(job, 'token');
    expect(result).toEqual({ success: false, error: 'Cannot reach the Job Tracker API' });
    vi.unstubAllGlobals();
  });
});

describe('fetchJobs', () => {
  it('returns the saved jobs with the bearer token', async () => {
    const rows: SavedJob[] = [{ id: 'j1', title: 'Eng', company: 'Acme', url: 'https://x/1', status: 'SAVED' }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => rows });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJobs('token-1');

    expect(result).toEqual({ success: true, data: rows });
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/jobs`, {
      headers: { Authorization: 'Bearer token-1' },
    });
    vi.unstubAllGlobals();
  });

  it('surfaces a 401 as an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    const result = await fetchJobs('bad');
    expect(result.error).toBe('Session expired — please log in again');
    vi.unstubAllGlobals();
  });
});

describe('markJobApplied', () => {
  it('PATCHes the status endpoint with APPLIED', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'j1', title: 'Eng', company: 'Acme', status: 'APPLIED' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await markJobApplied('j1', 'token-1');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/jobs/j1/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
      body: JSON.stringify({ status: 'APPLIED' }),
    });
    vi.unstubAllGlobals();
  });

  it('rejects an empty job id without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await markJobApplied('', 'token')).toEqual({ success: false, error: 'No job selected' });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('createNote', () => {
  it('POSTs the note to the job notes endpoint with the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'n1', job_id: 'j1', body: 'Referred by Sam' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createNote('j1', 'Referred by Sam', 'token-1');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/jobs/j1/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
      body: JSON.stringify({ body: 'Referred by Sam' }),
    });
    vi.unstubAllGlobals();
  });

  it('rejects an empty note without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await createNote('j1', '   ', 'token')).toEqual({
      success: false,
      error: 'A note needs a job and some text',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('surfaces a 401 as an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    const result = await createNote('j1', 'note', 'bad');
    expect(result.error).toBe('Session expired — please log in again');
    vi.unstubAllGlobals();
  });
});

describe('fetchMe', () => {
  it('returns the signed-in user with the bearer token', async () => {
    const me: User = { id: 'u1', name: 'Jane Smith', email: 'jane@example.com' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => me });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMe('token-1');

    expect(result).toEqual({ success: true, data: me });
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/auth/me`, {
      headers: { Authorization: 'Bearer token-1' },
    });
    vi.unstubAllGlobals();
  });

  it('surfaces a 401 as an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    const result = await fetchMe('bad');
    expect(result.error).toBe('Session expired — please log in again');
    vi.unstubAllGlobals();
  });

  it('reports a network failure gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await fetchMe('token');
    expect(result).toEqual({ success: false, error: 'Cannot reach the Job Tracker API' });
    vi.unstubAllGlobals();
  });
});

describe('findJobByUrl', () => {
  const jobs: SavedJob[] = [
    { id: 'j1', title: 'A', company: 'X', url: 'https://site.com/job/1?utm=x#top', status: 'SAVED' },
    { id: 'j2', title: 'B', company: 'Y', url: 'https://site.com/job/2/', status: 'APPLIED' },
    { id: 'j3', title: 'C', company: 'Z', url: null, status: 'SAVED' },
  ];

  it('matches ignoring query, hash and trailing slash', () => {
    expect(findJobByUrl(jobs, 'https://site.com/job/1')?.id).toBe('j1');
    expect(findJobByUrl(jobs, 'HTTPS://SITE.COM/job/2')?.id).toBe('j2');
  });

  it('returns undefined when nothing matches or url is empty', () => {
    expect(findJobByUrl(jobs, 'https://site.com/job/999')).toBeUndefined();
    expect(findJobByUrl(jobs, '')).toBeUndefined();
  });
});

