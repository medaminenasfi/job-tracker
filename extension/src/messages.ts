import type { ApiResult } from './types';

export type SaveJobResult = ApiResult;

export interface RuntimeMessage {
  type:
    | 'GET_TOKEN'
    | 'SET_TOKEN'
    | 'SAVE_JOB'
    | 'EXTRACT_JOB'
    | 'GET_JOBS'
    | 'MARK_APPLIED'
    | 'APPLICATION_DETECTED';
  token?: string;
  job?: unknown;
  jobId?: string;
  url?: string;
}

// window.postMessage payload used by the web /extension-login bridge page.
export const BRIDGE_SOURCE = 'jobtracker-bridge';
