// On-demand extractor, injected into the ACTIVE tab via chrome.scripting when the
// declarative content script isn't present (i.e. any site that isn't LinkedIn /
// Indeed / the web app). Reuses the exact same parsers as content.ts — no logic is
// duplicated. CRXJS builds this as a `?script` ESM loader and calls `onExecute`
// when the Scripting API injects it; the parsed job is posted back to the popup
// with an EXTRACT_RESULT runtime message.
import { extractJobData } from './parsers';
import { EXTRACT_RESULT, type RuntimeMessage } from './messages';

export const onExecute = (): void => {
  const job = extractJobData(document, window.location.href);
  chrome.runtime.sendMessage({ type: EXTRACT_RESULT, job } satisfies RuntimeMessage);
};
