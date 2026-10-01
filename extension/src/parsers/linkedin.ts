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

const CARD_SELECTORS = [
  '.job-details-jobs-unified-top-card',
  '.jobs-unified-top-card',
  '.top-card-layout',
];

export function parseLinkedIn(doc: Document): Partial<JobData> {
  const card =
    CARD_SELECTORS.map((sel) => doc.querySelector(sel)).find(Boolean) ?? doc;

  const title =
    firstText(doc, [
      '.job-details-jobs-unified-top-card__job-title',
      'a[data-testid="job-details-jobs-unified-top-card__job-title"]',
      'h1.top-card-layout__title',
      '.top-card-layout__title',
      '[data-testid="jobTitle"]',
    ]) ?? byClassPart(card, 'job-title');

  const company =
    firstText(doc, [
      '.job-details-jobs-unified-top-card__company-name',
      'a.job-details-jobs-unified-top-card__company-name',
      '.topcard__org-name-link',
      'a.topcard__org-name-link',
      '.top-card-layout__headline .topcard__flavor--black',
    ]) ??
    byClassPart(card, 'company-name') ??
    byClassPart(card, 'org-name');

  const location =
    firstText(doc, [
      '.job-details-jobs-unified-top-card__bullet',
      '.topcard__flavor-row .topcard__flavor',
      '.topcard__flavor-row span',
      '.jobs-unified-top-card__bullet',
    ]) ??
    byClassPart(card, 'location') ??
    byClassPart(card, 'bullet');

  return { title, company, location, source: 'linkedin' };
}
