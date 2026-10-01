import type { JobData } from '../types';
import { firstText } from './dom';

// LinkedIn rotates its BEM class suffixes between layouts, so exact selectors go
// stale fast. As a resilient fallback we scope to the job "top card" container and
// match descendants by a stable class *substring* (job-title / company-name /
// location / bullet), which survives those suffix changes.
function byClassPart(root: ParentNode, part: string): string | undefined {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('*'));
  const hit = nodes.find(
    (node) => typeof node.className === 'string' && node.className.includes(part),
  );
  return hit?.textContent?.trim() || undefined;
}

function locationFromDescription(root: ParentNode, company?: string): string | undefined {
  const container = root.querySelector(
    '.job-details-jobs-unified-top-card__primary-description-container, .top-card-layout__card',
  );
  if (!container) return undefined;

  const candidates = Array.from(container.querySelectorAll<HTMLElement>('span, div, a'))
    .map((node) => node.textContent?.trim())
    .filter((value): value is string => Boolean(value && value !== company));

  for (const value of candidates) {
    const location = normalizeLocation(value, company);
    if (location) return location;
  }
  return undefined;
}

function locationFromMetadata(root: ParentNode, company?: string): string | undefined {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('div, span, p, a'))
    .map((node) => node.textContent?.replace(/\s+/g, ' ').trim())
    .filter((value): value is string => Boolean(value?.includes('·')))
    .sort((left, right) => left.length - right.length);

  for (const value of candidates) {
    const location = normalizeLocation(value, company);
    if (location) return location;
  }
  return undefined;
}

function normalizeLocation(value?: string, company?: string): string | undefined {
  if (!value || value === company) return undefined;
  const candidates = value.split('·').map((part) => part.trim()).filter(Boolean);
  return candidates.find((candidate) => {
    if (candidate.length > 80 || /applicant|people|follower|posted|ago|employment/i.test(candidate)) {
      return false;
    }
    return candidate.includes(',') || /remote|hybrid|on[- ]?site/i.test(candidate);
  });
}

const CARD_SELECTORS = [
  '.job-details-jobs-unified-top-card',
  '.jobs-unified-top-card',
  '.top-card-layout',
];

function cleanLinkedInTitle(value?: string): { title?: string; company?: string } {
  if (!value) return {};

  const parts = value
    .replace(/^\s*#+\s*/, '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts[parts.length - 1]?.toLowerCase() === 'linkedin') parts.pop();

  return {
    title: parts[0] || undefined,
    company: parts.length > 1 ? parts[1] : undefined,
  };
}

export function parseLinkedIn(doc: Document): Partial<JobData> {
  const card =
    CARD_SELECTORS.map((sel) => doc.querySelector(sel)).find(Boolean) ?? doc;

  const rawTitle =
    firstText(doc, [
      '.job-details-jobs-unified-top-card__job-title',
      'a[data-testid="job-details-jobs-unified-top-card__job-title"]',
      'h1.top-card-layout__title',
      '.top-card-layout__title',
      '[data-testid="jobTitle"]',
    ]) ?? byClassPart(card, 'job-title') ?? doc.querySelector('title')?.textContent?.trim();

  const rawCompany =
    firstText(doc, [
      '.job-details-jobs-unified-top-card__company-name',
      'a.job-details-jobs-unified-top-card__company-name',
      '.topcard__org-name-link',
      'a.topcard__org-name-link',
      '.top-card-layout__headline .topcard__flavor--black',
    ]) ??
    byClassPart(card, 'company-name') ??
    byClassPart(card, 'org-name');

  const parsedTitle = cleanLinkedInTitle(rawTitle);
  const title = parsedTitle.title;
  const company = rawCompany ?? parsedTitle.company;

  const location =
    normalizeLocation(
      firstText(doc, [
      '.job-details-jobs-unified-top-card__bullet',
      '[class*="job-location"]',
      '[class*="jobLocation"]',
      '[class*="location-name"]',
      '[data-testid*="location"]',
      'a[href*="/jobs/search/?geoId"]',
      '[class*="top-card-layout__second-subline"]',
      '[class*="primary-description"]',
      '.topcard__flavor-row .topcard__flavor',
      '.topcard__flavor-row span',
      '.jobs-unified-top-card__bullet',
      ]),
      company,
    ) ??
    normalizeLocation(byClassPart(card, 'location'), company) ??
    normalizeLocation(byClassPart(card, 'bullet'), company) ??
    locationFromDescription(card, company) ??
    locationFromMetadata(doc, company);

  return { title, company, location, source: 'linkedin' };
}
