import type { JobData, JobSource } from '../types';
import { parseLinkedIn } from './linkedin';
import { parseIndeed } from './indeed';
import { parseGeneric } from './generic';
import { parseRippling } from './rippling';

// Copy only the keys whose value is defined. A site parser that didn't find a
// field returns `undefined` for it; spreading that directly would wipe a value
// the JSON-LD base already supplied. Filtering keeps the base as a fallback.
function definedOnly<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

export function extractJobData(doc: Document, url: string): JobData {
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = '';
  }

  // JSON-LD / OpenGraph parsing works on almost every job board and yields the
  // richest data (including description and salary), so use it as the universal
  // base for ALL sites — not just the generic fallback.
  const base = parseGeneric(doc);

  let site: Partial<JobData> = {};
  let source: JobSource = 'generic';
  if (hostname.includes('linkedin.com')) {
    site = parseLinkedIn(doc);
    source = 'linkedin';
  } else if (hostname.includes('indeed.com')) {
    site = parseIndeed(doc);
    source = 'indeed';
  } else if (hostname.includes('rippling.com')) {
    site = parseRippling(doc);
    source = 'generic';
  }

  // Site-specific selectors win where they found something; the JSON-LD base
  // fills every gap. `source` is forced to the detected site last.
  return {
    url,
    ...definedOnly(base),
    ...definedOnly(site),
    source,
  };
}

export { parseLinkedIn, parseIndeed, parseGeneric, parseRippling };
