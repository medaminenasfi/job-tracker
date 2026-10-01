import type { JobData } from '../types';
import { firstText } from './dom';

// Rippling ATS (ats.rippling.com/<board>/jobs/<id>) renders the posting client-side
// and ships the authoritative fields as JSON inside Next.js flight <script>
// payloads. There is NO JSON-LD JobPosting, and og:site_name is the ATS brand
// ("Rippling Recruiting"), not the employer — so we read the embedded payload
// instead of trusting meta tags.
function embedded(doc: Document, pattern: RegExp): string | undefined {
  const scripts = Array.from(doc.querySelectorAll('script'));
  for (const script of scripts) {
    const match = pattern.exec(script.textContent || '');
    if (match?.[1]) return match[1];
  }
  return undefined;
}

export function parseRippling(doc: Document): Partial<JobData> {
  const company = embedded(doc, /"companyName":"([^"]+)"/);
  const workLocation = embedded(doc, /"workLocations":\["([^"]+)"/);
  // The visible posting title is an <h2>; fall back to <h1> then let the generic
  // og:title layer fill any remaining gap.
  const title = firstText(doc, ['h2', 'h1']);

  return { title, company, location: workLocation, source: 'generic' };
}
