// Best-effort application-submission detection.
// These are pure functions over a DOM root so they can be unit-tested with jsdom.
// Selectors for third-party sites are fragile by nature; we combine known
// confirmation containers with a normalized text scan and treat every result as
// best-effort (the manual "Mark as Applied" path is the guaranteed fallback).

const LINKEDIN_PATTERNS = [/application sent/i, /application submitted/i];
const INDEED_PATTERNS = [/application sent/i, /you'?ve applied/i, /review your application/i];

const GENERIC_TEXT_PATTERNS = [
  /application (?:received|submitted|complete|successful|sent)/i,
  /thank you for (?:applying|your application)/i,
  /we(?:'ve| have) received your application/i,
  /your application has been (?:sent|submitted|received)/i,
];

const GENERIC_URL_PATTERNS = [
  /thank-?you/i,
  /confirmation/i,
  /application-(?:complete|submitted|success)/i,
  /\/success\b/i,
];

const LINKEDIN_SELECTORS = [
  '[data-test-apply-confirmation]',
  '.easyapply-confirmation',
  '.artdeco-modal.open',
];
const INDEED_SELECTORS = [
  '[data-testid="application-success"]',
  '.jobsearch-IndeedApply-modal',
];

function normalizedText(root: ParentNode): string {
  // Document.textContent is null per spec — read the body for a Document root.
  const node = (root as Document).body ?? (root as unknown as Element);
  return (node.textContent ?? '').replace(/\s+/g, ' ');
}

function anyMatch(haystack: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(haystack));
}

function scopedMatch(root: ParentNode, selectors: string[], patterns: RegExp[]): boolean {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    if (node && anyMatch(normalizedText(node), patterns)) return true;
  }
  return false;
}

export function detectLinkedInApplied(root: ParentNode): boolean {
  return (
    scopedMatch(root, LINKEDIN_SELECTORS, LINKEDIN_PATTERNS) ||
    anyMatch(normalizedText(root), LINKEDIN_PATTERNS)
  );
}

export function detectIndeedApplied(root: ParentNode): boolean {
  return (
    scopedMatch(root, INDEED_SELECTORS, INDEED_PATTERNS) ||
    anyMatch(normalizedText(root), INDEED_PATTERNS)
  );
}

export function detectGenericConfirmation(url: string, root: ParentNode): boolean {
  return (
    anyMatch(url, GENERIC_URL_PATTERNS) || anyMatch(normalizedText(root), GENERIC_TEXT_PATTERNS)
  );
}

export interface DetectionResult {
  detected: boolean;
  site: 'linkedin' | 'indeed' | 'generic';
}

export function detectApplication(hostname: string, url: string, root: ParentNode): DetectionResult {
  if (hostname.includes('linkedin.com')) {
    return { detected: detectLinkedInApplied(root), site: 'linkedin' };
  }
  if (hostname.includes('indeed.com')) {
    return { detected: detectIndeedApplied(root), site: 'indeed' };
  }
  return { detected: detectGenericConfirmation(url, root), site: 'generic' };
}
