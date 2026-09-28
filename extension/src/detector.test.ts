import { describe, it, expect } from 'vitest';
import {
  detectLinkedInApplied,
  detectIndeedApplied,
  detectGenericConfirmation,
  detectApplication,
} from './detector';

function doc(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe('detectLinkedInApplied', () => {
  it('detects the "Application sent" confirmation', () => {
    expect(detectLinkedInApplied(doc('<div class="artdeco-modal open">Application sent</div>'))).toBe(true);
  });

  it('is false on a normal job page', () => {
    expect(detectLinkedInApplied(doc('<h1>Senior Engineer</h1><button>Easy Apply</button>'))).toBe(false);
  });
});

describe('detectIndeedApplied', () => {
  it('detects a submitted application', () => {
    expect(detectIndeedApplied(doc('<div data-testid="application-success">Review your application</div>'))).toBe(true);
  });

  it('is false before applying', () => {
    expect(detectIndeedApplied(doc('<h1>Apply now</h1>'))).toBe(false);
  });
});

describe('detectGenericConfirmation', () => {
  it('detects via a thank-you URL', () => {
    expect(detectGenericConfirmation('https://acme.com/careers/thank-you', doc('<p>Anything</p>'))).toBe(true);
  });

  it('detects via confirmation text', () => {
    expect(detectGenericConfirmation('https://acme.com/done', doc('<p>We have received your application.</p>'))).toBe(true);
  });

  it('is false on an ordinary page', () => {
    expect(detectGenericConfirmation('https://acme.com/jobs/1', doc('<p>Job description here</p>'))).toBe(false);
  });
});

describe('detectApplication dispatcher', () => {
  it('routes by hostname and normalizes whitespace', () => {
    const d = doc('<div>\n  Application   sent \n</div>');
    expect(detectApplication('www.linkedin.com', 'https://www.linkedin.com/jobs/view/1', d)).toEqual({
      detected: true,
      site: 'linkedin',
    });
    expect(detectApplication('www.indeed.com', 'https://www.indeed.com/viewjob', d).site).toBe('indeed');
    expect(detectApplication('acme.com', 'https://acme.com/x', d).site).toBe('generic');
  });
});
