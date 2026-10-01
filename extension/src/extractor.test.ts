import { describe, it, expect, vi, afterEach } from 'vitest';
import { onExecute } from './extractor';
import { EXTRACT_RESULT } from './messages';

// The extractor is injected into a page and posts the parsed job back via
// chrome.runtime.sendMessage. Verify it reuses the shared parsers (here the
// generic JSON-LD path) and sends an EXTRACT_RESULT message.
function mockChrome() {
  const sendMessage = vi.fn();
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  return sendMessage;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('extractor onExecute', () => {
  it('parses JSON-LD from the page and sends EXTRACT_RESULT', () => {
    const sendMessage = mockChrome();
    document.head.innerHTML = `
      <script type="application/ld+json">
        { "@type": "JobPosting", "title": "Backend Engineer",
          "hiringOrganization": { "name": "Acme" },
          "jobLocation": { "address": { "addressLocality": "Berlin" } } }
      </script>`;

    onExecute();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const msg = sendMessage.mock.calls[0][0];
    expect(msg.type).toBe(EXTRACT_RESULT);
    expect(msg.job).toMatchObject({ title: 'Backend Engineer', company: 'Acme' });
  });

  it('still sends a result (with the page url) when no job data is found', () => {
    const sendMessage = mockChrome();
    document.body.innerHTML = '<h1>Not a job page</h1>';

    onExecute();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const msg = sendMessage.mock.calls[0][0];
    expect(msg.type).toBe(EXTRACT_RESULT);
    expect(msg.job).toBeDefined();
  });
});
