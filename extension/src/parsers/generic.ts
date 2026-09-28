import type { JobData } from '../types';

interface JsonLdJob {
  title?: string;
  organization?: string;
  name?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: unknown;
  baseSalary?: unknown;
  description?: string;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Recursively find a JobPosting node in JSON-LD (handles arrays, @graph, @nested).
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
  if (obj['@graph']) return findJobPosting(obj['@graph']);
  return undefined;
}

function parseLocation(jobLocation: unknown): string | undefined {
  if (!jobLocation || typeof jobLocation !== 'object') return undefined;
  const loc = jobLocation as Record<string, unknown>;
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
  const salary = baseSalary as Record<string, unknown>;
  const value = salary.value as Record<string, unknown> | undefined;
  const amount = text(String(value?.value ?? ''));
  const unit = text(String(value?.unitText ?? ''));
  if (!amount) return undefined;
  return unit ? `${amount} ${unit}` : amount;
}

export function parseGeneric(doc: Document): Partial<JobData> {
  let result: Partial<JobData> = { source: 'generic' };

  const scripts = Array.from(
    doc.querySelectorAll('script[type="application/ld+json"]'),
  );
  for (const script of scripts) {
    try {
      const job = findJobPosting(JSON.parse(script.textContent || ''));
      if (!job) continue;
      const org =
        typeof job.hiringOrganization === 'string'
          ? job.hiringOrganization
          : job.hiringOrganization?.name;
      result = {
        ...result,
        title: text(job.title) ?? text(job.name),
        company: text(org),
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

  result.title = result.title ?? text(og('og:title')) ?? text(doc.querySelector('title')?.textContent);
  result.description = result.description ?? text(og('og:description'));

  return result;
}
