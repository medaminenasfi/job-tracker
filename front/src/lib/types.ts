// Shared types used across the frontend — must match backend schema
export type UserRole = 'USER' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED';

export interface User {
  id: string;
  name: string;
  email: string;
  role?: UserRole;
  // Phase 9 — Google sign-in. Derived flags from the backend, never the raw ids.
  googleConnected?: boolean;
  hasPassword?: boolean;
  avatarUrl?: string | null;
}

export type JobStatus =
  | string;

export interface JobStatusConfig {
  id: string;
  name: string;
  color: string;
  position: number;
  is_default: boolean;
}

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
  match_score?: number | null;
  match_skills_matched?: string[] | null;
  match_skills_missing?: string[] | null;
  match_computed_at?: string | null;
  follow_up_at?: string | null;
  follow_up_sent?: boolean | null;
  cv_id?: string | null;
  saved_at?: string;
  applied_at?: string;
  created_at?: string;
  updated_at?: string;
}

// A managed CV (MVP3 Phase 1). parsed_text is stored server-side; the
// list endpoint returns text_length instead of the full text.
export interface CvEntry {
  text: string;
  dateRange?: string;
}

export interface CvStructuredData {
  fullName?: string;
  email?: string;
  phone?: string;
  links?: string[];
  experience: CvEntry[];
  education: CvEntry[];
  skills: string[];
}

export interface Cv {
  id: string;
  label: string;
  source: string;
  file_url?: string | null;
  is_default: boolean;
  created_at: string;
  text_length?: number | null;
  structured_data?: CvStructuredData | null;
  parse_method?: 'rule_based' | 'ai' | null;
  parse_status?: 'pending' | 'parsed' | 'partial' | 'failed' | null;
  parsed_at?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
}

// A single managed note attached to a job. Multiple notes per job live in the
// job_notes table; this mirrors the backend row shape.
export interface JobNote {
  id: string;
  job_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

// ---- Admin area (Phase 7) ----

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  account_status: AccountStatus;
  created_at: string;
  last_login_at?: string | null;
  job_count: number;
}

export interface AdminUserDetail extends Omit<AdminUserRow, 'job_count'> {
  jobCounts: { status: JobStatus; count: number }[];
  jobs: { id: string; title: string; company: string; status: JobStatus; source?: string | null; created_at: string }[];
}

export interface AdminJobRow {
  id: string;
  user_id: string;
  user_email?: string | null;
  title: string;
  company: string;
  status: JobStatus;
  source?: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  created_at: string;
  admin_email?: string | null;
}

export interface AdminStats {
  totalUsers: number;
  newUsersThisWeek: number;
  totalJobs: number;
  jobsByStatus: { status: JobStatus; count: number }[];
  signupsPerWeek: { week: string; count: number }[];
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ---- Admin CV templates (MVP3 Phase 3) ----
// Admin-authored LaTeX; the list omits latex_source (fetched on edit).

export type TemplateLanguage = 'en' | 'fr';

export interface AdminCvTemplate {
  id: string;
  name: string;
  description?: string | null;
  preview_image_url?: string | null;
  latex_source?: string;
  language: TemplateLanguage;
  is_active: boolean;
  created_by?: string | null;
  created_by_email?: string | null;
  created_at: string;
  latex_length?: number | null;
}

// ---- User dashboard home (Phase 8) ----

export interface Announcement {
  id: string;
  title: string;
  body: string;
  date: string;
}

export interface DashboardSummary {
  counts: {
    total: number;
    saved: number;
    applied: number;
    accepted: number;
    interview: number;
    offer: number;
    rejected: number;
    withdrawn: number;
  };
  activity: {
    appliedThisWeek: number;
    appliedThisMonth: number;
    last7Days: number[];
  };
  recentJobs: {
    id: string;
    title: string;
    company: string;
    status: JobStatus;
    created_at: string;
  }[];
  checklist: {
    accountCreated: boolean;
    extensionConnected: boolean;
    firstJobSaved: boolean;
    appliedJob: boolean;
    profileFilled?: boolean;
  };
  announcements: Announcement[];
}

