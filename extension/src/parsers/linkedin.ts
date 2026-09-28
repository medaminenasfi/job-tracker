import type { JobData } from '../types';

export function parseLinkedIn(doc: Document): Partial<JobData> {
  const title =
    doc.querySelector('h1.top-card-layout__title')?.textContent?.trim() ||
    doc.querySelector('.top-card-layout__title')?.textContent?.trim();
  const company =
    doc.querySelector('.topcard__org-name-link')?.textContent?.trim() ||
    doc.querySelector('a.topcard__org-name-link')?.textContent?.trim();
  const location = doc
    .querySelector('.topcard__flavor-row span')?.textContent?.trim();

  return { title, company, location, source: 'linkedin' };
}
