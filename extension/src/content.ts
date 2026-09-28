import { extractJobData } from './parsers';
import { detectApplication } from './detector';
import { BRIDGE_SOURCE, type RuntimeMessage } from './messages';

chrome.runtime.onMessage.addListener(
  (request: RuntimeMessage, _sender, sendResponse) => {
    if (request.type === 'EXTRACT_JOB') {
      sendResponse({ job: extractJobData(document, window.location.href) });
    }
  },
);

// Auto-detect a submitted application on LinkedIn/Indeed job pages and notify the
// service worker, which flips the matching saved job to APPLIED. Best-effort:
// the popup's manual "Mark as Applied" is the guaranteed fallback everywhere.
function watchForApplication(): void {
  const { hostname, href } = window.location;
  const isJobSite = hostname.includes('linkedin.com') || hostname.includes('indeed.com');
  if (!isJobSite) return;

  let reported = false;
  const check = () => {
    if (reported) return;
    const { detected } = detectApplication(hostname, href, document);
    if (!detected) return;
    reported = true;
    chrome.runtime.sendMessage({ type: 'APPLICATION_DETECTED', url: href } satisfies RuntimeMessage);
  };

  const observer = new MutationObserver(check);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  check();
}

watchForApplication();

// Login bridge: the web app's /extension-login page posts the access token to
// this content script, which forwards it to the service worker for storage.
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (
    !data ||
    typeof data !== 'object' ||
    data.source !== BRIDGE_SOURCE ||
    data.type !== 'SET_TOKEN' ||
    typeof data.token !== 'string'
  ) {
    return;
  }
  chrome.runtime.sendMessage({ type: 'SET_TOKEN', token: data.token } satisfies RuntimeMessage, () => {
    void chrome.runtime.lastError;
    window.postMessage({ source: BRIDGE_SOURCE, type: 'TOKEN_SAVED' }, window.location.origin);
  });
});

