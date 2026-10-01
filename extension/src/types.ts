export type JobSource = 'linkedin' | 'indeed' | 'generic' | 'manual';

export interface JobData {
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  source?: JobSource;
  description?: string;
  salary?: string;
  notes?: string;
}

// Shape returned by GET /auth/me (subset the popup displays).
export interface User {
  id: string;
  name: string;
  email: string;
}

export type JobStatus =
  | 'SAVED'
  | 'APPLIED'
  | 'SCREENING'
  | 'INTERVIEW'
  | 'OFFER'
  | 'REJECTED'
  | 'WITHDRAWN';

// Shape returned by GET /jobs (subset the extension relies on).
export interface SavedJob {
  id: string;
  title: string;
  company: string;
  url?: string | null;
  status: JobStatus;
}

export interface ApiResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

