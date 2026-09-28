import type { JobData } from '../types';

export function parseIndeed(doc: Document): Partial<JobData> {
  const title =
    doc.querySelector('h1.jobsearch-JobInfoHeader-title')?.textContent?.trim() ||
    doc.querySelector('[data-testid="jobTitle"]')?.textContent?.trim();
  const company = doc
    .querySelector('[data-testid="inlineHeader-companyName"]')
    ?.textContent?.trim();
  const location = doc
    .querySelector('div[data-testid="jobLocation"]')?.textContent?.trim();

  return { title, company, location, source: 'indeed' };
}
