// Shared types used across the frontend — must match backend schema
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

export interface Job {
  id: string;
  user_id: string;
  title: string;
  company: string;
  location?: string;
  url?: string;
  source?: string;
  description?: string;
  salary?: string;
  employment_type?: string;
  status: JobStatus;
  notes?: string;
  saved_at?: string;
  applied_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
}
