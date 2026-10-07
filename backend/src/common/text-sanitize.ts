// Text sanitization shared by CV extraction and the LaTeX merge.
//
// PDF text extraction (poppler's `pdftotext`, and especially the `pdf-parse`
// fallback used when poppler is absent) can emit raw C0/C1 control bytes —
// U+0015 "NAK", U+0016 "SYN", U+001C "FS", U+001D "GS" and friends. They are
// invisible in the builder's textareas but carry no meaning, and pdflatex aborts
// on them with "Unicode character ^^V (U+0016)" and produces no PDF.
//
// Stripping them at extraction keeps stored text clean; stripping them again in
// the LaTeX escape is defense-in-depth that also rescues CVs stored before this
// fix and anything a user pastes straight into a field.

// Every C0 control except the whitespace we rely on (\t \n \r), plus DEL and the
// C1 range. None of these are ever legitimate CV content.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Removes control characters that break extraction output and the LaTeX build. */
export function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS_RE, '');
}
