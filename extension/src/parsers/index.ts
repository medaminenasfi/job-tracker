import type { JobData } from '../types';
import { parseLinkedIn } from './linkedin';
import { parseIndeed } from './indeed';
import { parseGeneric } from './generic';

export function extractJobData(doc: Document, url: string): JobData {
  const base: JobData = { url };
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = '';
  }

  if (hostname.includes('linkedin.com')) return { ...base, ...parseLinkedIn(doc) };
  if (hostname.includes('indeed.com')) return { ...base, ...parseIndeed(doc) };
  return { ...base, ...parseGeneric(doc) };
}

export { parseLinkedIn, parseIndeed, parseGeneric };
