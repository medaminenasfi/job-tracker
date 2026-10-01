import { describe, it, expect } from 'vitest';
import { extractJobData, parseGeneric, parseRippling } from './index';
import { parseLinkedIn } from './linkedin';
import { parseIndeed } from './indeed';

function doc(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe('parseLinkedIn', () => {
  it('extracts title, company and location', () => {
    const d = doc(`
      <h1 class="top-card-layout__title">Senior Frontend Engineer</h1>
      <a class="topcard__org-name-link">Acme Corp</a>
      <div class="topcard__flavor-row"><span>Berlin, Germany</span></div>
    `);
    expect(parseLinkedIn(d)).toEqual({
      title: 'Senior Frontend Engineer',
      company: 'Acme Corp',
      location: 'Berlin, Germany',
      source: 'linkedin',
    });
  });

  it('returns undefined fields on a non-job page', () => {
    const d = doc('<h1>Feed</h1>');
    const result = parseLinkedIn(d);
    expect(result.source).toBe('linkedin');
    expect(result.title).toBeUndefined();
  });

  it('falls back to class-substring matching inside the top card', () => {
    // LinkedIn rotates BEM suffixes; the stable substrings still resolve.
    const d = doc(`
      <div class="job-details-jobs-unified-top-card">
        <span class="new-layout__job-title-x">Staff Engineer</span>
        <a class="new-layout__company-name-x">Acme</a>
        <span class="new-layout__location-x">Remote</span>
      </div>
    `);
    const result = parseLinkedIn(d);
    expect(result.title).toBe('Staff Engineer');
    expect(result.company).toBe('Acme');
    expect(result.location).toBe('Remote');
  });
});

describe('parseRippling', () => {
  it('reads employer and work location from the embedded flight JSON', () => {
    const d = doc(`
      <h2 class="css-of4wst">Frontend Developer</h2>
      <script>{"companyName":"Web Hosting Canada","workLocations":["Hybrid (Tunis, TN)"]}</script>
    `);
    const result = parseRippling(d);
    expect(result.title).toBe('Frontend Developer');
    expect(result.company).toBe('Web Hosting Canada');
    expect(result.location).toBe('Hybrid (Tunis, TN)');
  });

  it('returns undefined fields when the payload is absent', () => {
    const d = doc('<h2>Some heading</h2>');
    const result = parseRippling(d);
    expect(result.title).toBe('Some heading');
    expect(result.company).toBeUndefined();
    expect(result.location).toBeUndefined();
  });
});

describe('parseIndeed', () => {
  it('extracts title, company and location', () => {
    const d = doc(`
      <h1 class="jobsearch-JobInfoHeader-title">Backend Developer</h1>
      <div data-testid="inlineHeader-companyName">Initech</div>
      <div data-testid="jobLocation">Austin, TX</div>
    `);
    expect(parseIndeed(d)).toEqual({
      title: 'Backend Developer',
      company: 'Initech',
      location: 'Austin, TX',
      source: 'indeed',
    });
  });
});

describe('parseGeneric', () => {
  it('prefers JSON-LD JobPosting data including salary and location', () => {
    const d = doc(`
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": "DevOps Engineer",
        "description": "Build pipelines",
        "hiringOrganization": { "@type": "Organization", "name": "CloudCo" },
        "jobLocation": { "@type": "Place", "address": {
          "@type": "PostalAddress",
          "addressLocality": "Lisbon",
          "addressCountry": "PT"
        }},
        "baseSalary": { "@type": "MonetaryAmount", "value": { "value": "60000", "unitText": "YEAR" } }
      }
      </script>
    `);
    expect(parseGeneric(d)).toEqual({
      source: 'generic',
      title: 'DevOps Engineer',
      company: 'CloudCo',
      location: 'Lisbon, PT',
      salary: '60000 YEAR',
      description: 'Build pipelines',
    });
  });

  it('finds JobPosting nested in @graph or arrays', () => {
    const d = doc(`
      <script type="application/ld+json">
      { "@graph": [
        { "@type": "WebSite", "name": "Jobs" },
        { "@type": "JobPosting", "title": "Designer", "hiringOrganization": "StudioX" }
      ]}
      </script>
    `);
    const result = parseGeneric(d);
    expect(result.title).toBe('Designer');
    expect(result.company).toBe('StudioX');
  });

  it('falls back to OpenGraph then <title> when JSON-LD is malformed', () => {
    const d = doc(`
      <script type="application/ld+json">{ not valid json </script>
      <title>Page Title</title>
      <meta property="og:description" content="A great role">
    `);
    expect(parseGeneric(d)).toEqual({
      source: 'generic',
      title: 'Page Title',
      company: undefined,
      location: undefined,
      salary: undefined,
      description: 'A great role',
    });
  });

  it('returns only source on an empty page', () => {
    const d = doc('');
    expect(parseGeneric(d)).toEqual({ source: 'generic', title: undefined, description: undefined });
  });

  it('fills title and location from the page but never company from og:site_name', () => {
    const d = doc(`
      <meta property="og:site_name" content="Rippling Recruiting">
      <h1>Frontend Developer</h1>
      <span class="job-location">Montréal, QC</span>
    `);
    const result = parseGeneric(d);
    expect(result.title).toBe('Frontend Developer');
    expect(result.location).toBe('Montréal, QC');
    // og:site_name is the ATS/platform brand, not the employer — using it writes
    // the wrong company, so it must never populate company.
    expect(result.company).toBeUndefined();
  });

  it('prefers a clean h1 over the noisier og:title', () => {
    const d = doc(`
      <meta property="og:title" content="Frontend Developer | Current Openings">
      <h1>Frontend Developer</h1>
    `);
    expect(parseGeneric(d).title).toBe('Frontend Developer');
  });

  it('resolves a JobPosting nested inside an ItemList', () => {
    const d = doc(`
      <script type="application/ld+json">
      { "@type": "ItemList", "itemListElement": [
        { "@type": "ListItem", "item": { "@type": "JobPosting", "title": "PM", "hiringOrganization": [{ "name": "CorpA" }] } }
      ]}
      </script>
    `);
    const result = parseGeneric(d);
    expect(result.title).toBe('PM');
    expect(result.company).toBe('CorpA');
  });
});

describe('extractJobData', () => {
  it('routes LinkedIn URLs to the LinkedIn parser and keeps the url', () => {
    const d = doc('<h1 class="top-card-layout__title">Engineer</h1>');
    const job = extractJobData(d, 'https://www.linkedin.com/jobs/view/123');
    expect(job).toMatchObject({ source: 'linkedin', title: 'Engineer', url: 'https://www.linkedin.com/jobs/view/123' });
  });

  it('routes Indeed URLs to the Indeed parser', () => {
    const d = doc('<h1 class="jobsearch-JobInfoHeader-title">Dev</h1>');
    expect(extractJobData(d, 'https://www.indeed.com/viewjob?jk=abc').source).toBe('indeed');
  });

  it('falls back to the generic parser for other sites and invalid URLs', () => {
    const d = doc('<title>Some Job</title>');
    expect(extractJobData(d, 'https://example.com/job/1').source).toBe('generic');
    expect(extractJobData(d, 'not-a-url').source).toBe('generic');
  });

  it('fills fields the site parser missed from the JSON-LD base', () => {
    // A LinkedIn page whose DOM selectors we don't match, but with JSON-LD data.
    const d = doc(`
      <script type="application/ld+json">
      { "@type": "JobPosting", "title": "Data Analyst", "description": "Crunch numbers",
        "hiringOrganization": { "name": "DataCo" } }
      </script>
    `);
    const job = extractJobData(d, 'https://www.linkedin.com/jobs/view/999');
    expect(job).toMatchObject({
      source: 'linkedin',
      title: 'Data Analyst',
      company: 'DataCo',
      description: 'Crunch numbers',
    });
  });

  it('lets a site-specific selector override the JSON-LD base', () => {
    const d = doc(`
      <script type="application/ld+json">
      { "@type": "JobPosting", "title": "Wrong Title" }
      </script>
      <h1 class="top-card-layout__title">Right Title</h1>
    `);
    const job = extractJobData(d, 'https://www.linkedin.com/jobs/view/1');
    expect(job.title).toBe('Right Title');
    expect(job.source).toBe('linkedin');
  });
});
