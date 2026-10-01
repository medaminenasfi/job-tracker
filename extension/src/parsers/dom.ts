// Returns the trimmed text of the first selector that matches an element with
// non-empty content. Lets each site parser list modern selectors first and fall
// back to legacy ones without repeating the query/trim dance.
export function firstText(
  doc: Document,
  selectors: string[],
): string | undefined {
  for (const selector of selectors) {
    const value = doc.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return undefined;
}
