// Turns a raw pdflatex transcript into something safe to show an admin.
//
// Why this exists: a template that fails to compile used to surface only
// "The template could not be compiled." The line number was available the whole
// time — pdflatex writes `./input.tex:12: …` into its log — so an admin had to
// bisect their own source by hand.
//
// Why it is a whitelist and not a passthrough: the log contains absolute paths
// inside the container, font/package names from the TeX distribution, and
// fragments of the template itself. Returning any of it verbatim would leak
// internals to the API response. So only two things cross the boundary: a line
// number (a number, nothing else) and a message chosen from this table.

/**
 * Hard cap on what we read out of a log: a runaway document can emit a lot of
 * text and none of it is worth parsing.
 */
const MAX_LOG_BYTES = 256 * 1024;
const HALF_LOG_BYTES = MAX_LOG_BYTES / 2;

/** Head + tail of an oversized log, with a marker where the middle was dropped. */
function bounded(log: Buffer): Buffer {
  if (log.length <= MAX_LOG_BYTES) return log;
  return Buffer.concat([
    log.subarray(0, HALF_LOG_BYTES),
    Buffer.from('\n...log truncated...\n', 'utf8'),
    log.subarray(log.length - HALF_LOG_BYTES),
  ]);
}

/** A compile failure, reduced to what is safe to return over HTTP. */
export interface LatexFailure {
  /** 1-based line in the template source, when the log named one. */
  line?: number;
  /** Whitelisted, user-safe description. */
  message: string;
}

/**
 * Patterns matched against the log, in priority order. Each captures the line
 * number where the template file is named.
 *
 * pdflatex reports in two shapes:
 *   ./input.tex:12: Undefined control sequence.
 *   ! Undefined control sequence.
 *   l.12 \foo
 * The first gives the line directly; the second needs the `l.<n>` follow-up.
 */
const FILE_ERROR = /(?:^|\n)[^\n]*input\.tex:(\d+):\s*([^\n]*)/;
const LINE_ERROR = /(?:^|\n)l\.(\d+)\s/;

/**
 * Known LaTeX failures mapped to an actionable message.
 *
 * Keys are matched case-insensitively as substrings of the log's error line.
 * Deliberately narrow: each entry is something an admin can act on, and the
 * message never echoes log content.
 */
const KNOWN_ERRORS: Array<{ match: RegExp; message: string }> = [
  {
    match: /file `?[\w.-]+\.sty'? not found|file not found/i,
    message:
      'A package this template loads is not installed in the sandbox. Remove it or use one from the allowed list.',
  },
  {
    match: /undefined control sequence/i,
    message:
      'Unknown LaTeX command. Check the spelling, and remember that commands from packages you did not load will not exist.',
  },
  {
    match: /begin\{document\} ended by/i,
    message:
      'The document body has no matching \\begin{document}. A stray brace or a missing \\end{document} usually causes this.',
  },
  {
    match: /missing \\begin\{document\}/i,
    message:
      'The document never reaches \\begin{document}. Something before it failed, or a placeholder was left unescaped.',
  },
  {
    match: /emergency stop/i,
    message:
      'The compiler stopped and could not recover. A missing \\end{document} or an unbalanced brace is the usual cause.',
  },
  {
    match: /extra }, or forgotten/i,
    message: 'There is an unmatched closing brace } in the template.',
  },
  {
    match: /missing } inserted/i,
    message: 'There is an unmatched opening brace { in the template.',
  },
  {
    match: /paragraph ended before/i,
    message:
      'A command is missing its argument. Check that every \\command is followed by {…}.',
  },
  // Both of these end in "Fatal error occurred, no output PDF file produced!",
  // so they must be matched BEFORE the no-output entry below — otherwise the
  // admin sees "produced no PDF" (a symptom) instead of the actual mistake.
  {
    match: /perhaps a missing \\item/i,
    message:
      'A list (itemize/enumerate) needs \\item before its content. Inside the list write \\item {{experience}}, not the placeholder on its own.',
  },
  {
    match: /can be used only in preamble/i,
    message:
      'A template must be a single document. Remove the extra \\documentclass — pasting two templates into one source causes this.',
  },
  {
    match: /no output PDF/i,
    message: 'The template compiled but produced no PDF.',
  },
  {
    match: /not allowed in LR mode|math shift/i,
    message: 'A $ or & is being used outside a math or table environment.',
  },
  {
    match: /runaway argument/i,
    message:
      'A command took more arguments than it expects, which usually means a missing closing brace.',
  },
];

const GENERIC = 'The template could not be compiled.';

/**
 * Reduces a pdflatex log to a line number and a whitelisted message.
 *
 * Returns null for a log with nothing recognizable in it, so the caller can fall
 * back to its generic message rather than claiming a cause it did not find.
 */
export function summarizeLatexFailure(
  log: Buffer | undefined | null,
): LatexFailure | null {
  // The failure is appended where it happened, so a truncated view that keeps
  // only the head would miss it in a long document. Head plus tail.
  if (!log?.length) return null;
  const text = bounded(log).toString('utf8');
  if (!text.trim()) return null;

  const fileError = FILE_ERROR.exec(text);
  const lineError = LINE_ERROR.exec(text);
  const line = fileError?.[1] ?? lineError?.[1];
  const lineNumber = line ? Number(line) : Number.NaN;

  // The known-error table is matched against the whole log rather than a single
  // captured line: the two shapes of pdflatex report put the description and the
  // location on different lines, and a message split across a wrap should still
  // match.
  const known = KNOWN_ERRORS.find((entry) => entry.match.test(text));
  const failure: LatexFailure = { message: known?.message ?? GENERIC };
  if (Number.isInteger(lineNumber) && lineNumber > 0) {
    failure.line = lineNumber;
  }
  return failure;
}