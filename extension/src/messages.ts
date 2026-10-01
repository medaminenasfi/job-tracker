import type { ApiResult } from './types';

export type SaveJobResult = ApiResult;

// Message type constants shared by the popup, background and injected extractor so
// the string is defined once (no drift between sender and receiver).
export const EXTRACT_RESULT = 'EXTRACT_RESULT';
export const LOGOUT = 'LOGOUT';

export interface RuntimeMessage {
  type:
    | 'GET_TOKEN'
    | 'SET_TOKEN'
    | 'GET_ME'
    | 'LOGOUT'
    | 'SAVE_JOB'
    | 'EXTRACT_JOB'
    | 'EXTRACT_RESULT'
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
