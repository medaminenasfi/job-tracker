'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import type { JobStatusConfig } from '@/lib/types';

export const DEFAULT_STATUS_NAMES = [
  'SAVED',
  'APPLIED',
  'ACCEPTED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
];

export function useJobStatuses() {
  return useQuery({
    queryKey: ['job-statuses'],
    queryFn: () => apiJson<JobStatusConfig[]>('/api/users/statuses'),
    staleTime: 60_000,
  });
}

export function statusLabel(name: string) {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}