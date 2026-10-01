import type { JobData } from '../types';
import { firstText } from './dom';

// Indeed has rotated between `jobsearch-JobInfoHeader-*` classes and
// `data-testid` attributes. List both so the popup prefills on either markup;
// anything missing is filled from the JSON-LD base by extractJobData.
export function parseIndeed(doc: Document): Partial<JobData> {
  const title = firstText(doc, [
    'h1[data-testid="jobTitle"]',
    '[data-testid="jobTitle"]',
    'h1.jobsearch-JobInfoHeader-title',
    '.jobsearch-JobInfoHeader-title',
  ]);
  const company = firstText(doc, [
    '[data-testid="inlineHeader-companyName"]',
    'div[data-testid="jobsearch-InlineHeader-companyName"]',
    '.jobsearch-InlineHeader-companyName',
  ]);
  const location = firstText(doc, [
    'div[data-testid="jobsearch-InlineHeader-locations"]',
    '[data-testid="jobLocation"]',
    'div.jobsearch-InlineHeader-locations',
  ]);

  return { title, company, location, source: 'indeed' };
}
