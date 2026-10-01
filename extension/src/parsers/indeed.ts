import type { JobData } from '../types';
import { firstText } from './dom';

function textByHint(doc: Document, hint: string): string | undefined {
  const nodes = Array.from(doc.querySelectorAll<HTMLElement>('*'));
  const hit = nodes.find((node) => {
    const attributes = [node.className, node.id, node.getAttribute('data-testid')]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();
    return attributes.includes(hint) && Boolean(node.textContent?.trim());
  });
  return hit?.textContent?.trim() || undefined;
}

function nearbyCompany(doc: Document, title?: string): string | undefined {
  const heading = doc.querySelector('h1');
  if (!heading) return undefined;
  const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a'));
  const companyLink = links.find((link) => {
    const text = link.textContent?.trim();
    return Boolean(
      text &&
        text !== title &&
        text.length < 100 &&
        heading.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  return companyLink?.textContent?.trim() || undefined;
}

// Indeed has rotated between `jobsearch-JobInfoHeader-*` classes and
// `data-testid` attributes. List both so the popup prefills on either markup;
// anything missing is filled from the JSON-LD base by extractJobData.
export function parseIndeed(doc: Document): Partial<JobData> {
  const title = firstText(doc, [
    'h1[data-testid="jobTitle"]',
    '[data-testid="jobTitle"]',
    'h1.jobsearch-JobInfoHeader-title',
    '.jobsearch-JobInfoHeader-title',
  ]) ?? doc.querySelector('h1')?.textContent?.trim();
  const company = firstText(doc, [
    '[data-testid="inlineHeader-companyName"]',
    'div[data-testid="jobsearch-InlineHeader-companyName"]',
    '.jobsearch-InlineHeader-companyName',
    '[data-testid*="company"]',
    '[class*="companyName"]',
    '[class*="company-name"]',
    'a[href*="/cmp/"]',
    'a[href*="/company/"]',
  ]) ?? textByHint(doc, 'company') ?? nearbyCompany(doc, title);
  const location = firstText(doc, [
    'div[data-testid="jobsearch-InlineHeader-locations"]',
    '[data-testid="jobLocation"]',
    'div.jobsearch-InlineHeader-locations',
    '[data-testid*="location"]',
    '[class*="jobLocation"]',
    '[class*="location"]',
    '[aria-label*="location" i]',
  ]) ?? textByHint(doc, 'location');

  return { title, company, location, source: 'indeed' };
}
