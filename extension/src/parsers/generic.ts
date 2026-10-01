import type { JobData } from '../types';
import { firstText } from './dom';

interface JsonLdJob {
  title?: string;
  organization?: string;
  name?: string;
  hiringOrganization?:
    | { name?: string }
    | { name?: string }[]
    | string;
  jobLocation?: unknown;
  baseSalary?: unknown;
  description?: string;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Recursively find a JobPosting node in JSON-LD. Descends into arrays and every
// nested object so @graph wrappers, ItemList > itemListElement > item shapes and
// other nesting styles all resolve to the same node.
function findJobPosting(node: unknown): JsonLdJob | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!node || typeof node !== 'object') return undefined;
  const obj = node as Record<string, unknown>;
  const type = obj['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) {
    return obj as unknown as JsonLdJob;
  }
  for (const value of Object.values(obj)) {
    const found = findJobPosting(value);
    if (found) return found;
  }
  return undefined;
}

function parseLocation(jobLocation: unknown): string | undefined {
  if (!jobLocation || typeof jobLocation !== 'object') return undefined;
  const loc = (Array.isArray(jobLocation) ? jobLocation[0] : jobLocation) as Record<
    string,
    unknown
  >;
  if (!loc || typeof loc !== 'object') return undefined;
  const address = (loc.address ?? loc) as Record<string, unknown>;
  const parts = [
    text(address.addressLocality),
    text(address.addressRegion),
    text(address.addressCountry),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

function parseSalary(baseSalary: unknown): string | undefined {
  if (!baseSalary || typeof baseSalary !== 'object') return undefined;
  const salary = (Array.isArray(baseSalary) ? baseSalary[0] : baseSalary) as Record<
    string,
    unknown
  >;
  if (!salary || typeof salary !== 'object') return undefined;
  const value = salary.value as Record<string, unknown> | undefined;
  const amount = text(String(value?.value ?? ''));
  const unit = text(String(value?.unitText ?? ''));
  if (!amount) return undefined;
  return unit ? `${amount} ${unit}` : amount;
}

function parseOrg(hiringOrganization: JsonLdJob['hiringOrganization']): string | undefined {
  if (typeof hiringOrganization === 'string') return text(hiringOrganization);
  if (Array.isArray(hiringOrganization)) return text(hiringOrganization[0]?.name);
  return text(hiringOrganization?.name);
}

// On-page signals for a job's location when JSON-LD is absent. Kept to selectors
// that clearly denote a posting's location (ATS conventions) so we don't grab
// unrelated nav/footer text.
const LOCATION_SELECTORS = [
  '[data-testid*="location"]',
  '[class*="job-location"]',
  '[class*="jobLocation"]',
  '[id*="job-location"]',
  '.location',
];

export function parseGeneric(doc: Document): Partial<JobData> {
  let result: Partial<JobData> = { source: 'generic' };

  const scripts = Array.from(
    doc.querySelectorAll('script[type="application/ld+json"]'),
  );
  for (const script of scripts) {
    try {
      const job = findJobPosting(JSON.parse(script.textContent || ''));
      if (!job) continue;
      result = {
        ...result,
        title: text(job.title) ?? text(job.name),
        company: parseOrg(job.hiringOrganization),
        location: parseLocation(job.jobLocation),
        salary: parseSalary(job.baseSalary),
        description: text(job.description),
      };
      break;
    } catch {
      // Malformed JSON-LD block — fall through to other sources.
    }
  }

  const og = (prop: string) =>
    doc.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ?? undefined;

  // Layered fallbacks so pages without a JobPosting block still prefill:
  //  - title: a clean on-page <h1> beats the noisier og:title / <title>.
  //  - location: common ATS location markers.
  // NOTE: og:site_name is deliberately NOT used for company — on hosted ATS pages
  // (Rippling, etc.) it is the platform brand ("Rippling Recruiting"), not the
  // actual employer, so trusting it writes the wrong company.
  result.title =
    result.title ?? firstText(doc, ['h1']) ?? text(og('og:title')) ?? text(doc.querySelector('title')?.textContent);
  result.location = result.location ?? firstText(doc, LOCATION_SELECTORS);
  result.description = result.description ?? text(og('og:description'));

  return result;
}
