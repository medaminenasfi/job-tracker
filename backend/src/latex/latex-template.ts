// LaTeX handling for MVP3 CV templates.
//
// Two non-negotiable rules from the roadmap live here:
// 1. Values (CV/profile content) are NEVER interpreted as LaTeX — every value is
//    escaped to literal text before substitution.
// 2. Template sources are restricted to a small, fixed placeholder set and may
//    not embed file/shell-escaping primitives.

import { stripControlChars } from '../common/text-sanitize';

// The complete placeholder set a template may use. Documented for admins via
// GET /admin/cv-templates/placeholders and mirrored in the admin UI.
export const CV_TEMPLATE_PLACEHOLDERS = [
  'fullName',
  'headline',
  'profile',
  'email',
  'phone',
  'links',
  'experience',
  'education',
  'certificates',
  'skills',
] as const;

export type CvTemplatePlaceholder = (typeof CV_TEMPLATE_PLACEHOLDERS)[number];

const PLACEHOLDER_SET = new Set<string>(CV_TEMPLATE_PLACEHOLDERS);

// TeX primitives that read/write files, read from the terminal, or escape to the
// shell. The template source is the whole document (it supplies its own
// `\documentclass` and preamble), so these can only be attempts to break out of
// it. Package loading is handled separately by ALLOWED_LATEX_PACKAGES.
const FORBIDDEN_LATEX_PRIMITIVES = [
  '\\input',
  '\\include',
  '\\RequirePackage',
  '\\write',
  '\\immediate',
  '\\openout',
  '\\openin',
  '\\read',
  '\\readline',
  '\\catcode',
  '\\special',
  '\\write18',
  '\\directlua',
  '\\latelua',
  '\\pdfliteral',
  '\\def',
  '\\let',
  '\\csname',
  '\\expandafter',
  '\\newread',
  '\\newwrite',
  '\\endinput',
  '\\loop',
];

// Matched with a trailing "not a letter" guard: several of these primitives are
// prefixes of harmless commands, and `\definecolor` alone would otherwise be
// read as `\def`. Each primitive is escaped for RegExp, so e.g. `\def` matches
// that literal text rather than being read as the `\d` digit class.
const FORBIDDEN_LATEX_PATTERN = new RegExp(
  `(?:${FORBIDDEN_LATEX_PRIMITIVES.map((p) => p.replace(/\\/g, '\\\\')).join(
    '|',
  )})(?![a-zA-Z])`,
);

// Real CV templates (the popular Word-mirroring ones, for instance) load
// presentation packages for fonts, colour and section headings, so
// `\usepackage` cannot simply be banned. It is allowlisted instead: every entry
// below only affects typography and page layout, and none of them can read a
// file, write to the filesystem, or reach the shell. Anything else - shellesc,
// filecontents, the fontspec/lua/shell-escape family - is rejected, so loading a
// package stays a formatting decision and not a code-execution one.
// Keep in sync with the packages present in worker/Dockerfile.
const ALLOWED_LATEX_PACKAGES = new Set([
  'amsmath',
  'amssymb',
  'array',
  'babel',
  'charter',
  'color',
  'courier',
  'csquotes',
  'enumitem',
  'fancyhdr',
  'fontenc',
  'fullpage',
  'geometry',
  'hyperref',
  'iftex',
  'inconsolata',
  'inputenc',
  'koma-script',
  'latexsym',
  'lipsum',
  'mathptmx',
  'marvosym',
  'microtype',
  'multicol',
  'needspace',
  'newtxtext',
  'parskip',
  'ragged2e',
  'setspace',
  'soul',
  'tabularray',
  'tabularx',
  'tgheros',
  'tgtermes',
  'titlesec',
  'xcolor',
  'xurl',
]);

const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

export class LatexTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LatexTemplateError';
  }
}

/**
 * Neutralizes every LaTeX special character so user content is rendered as
 * literal text, and drops the raw control bytes that PDF extraction can leave
 * behind (which otherwise abort pdflatex with "Unicode character ^^V"). This is
 * the actual LaTeX-injection defense; the Phase 4 sandbox is defense-in-depth on
 * top of it.
 */
export function escapeLatex(value: string): string {
  return stripControlChars(value).replace(
    /[\\{}$&#_%~^]/g,
    (char) => LATEX_ESCAPES[char] ?? char,
  );
}

/**
 * Turns the newlines of a multi-line field into hard LaTeX line breaks.
 *
 * The builder UI asks for "one entry per line" (each job, each link), but TeX
 * treats a source newline as an ordinary space — so without this the whole field
 * collapses into a single run-on paragraph and the CV is unreadable. A run of
 * newlines becomes one `\\{}`:
 *   - `\\` is the hard break;
 *   - the trailing `{}` is an empty group that stops TeX from reading a `[` at
 *     the start of the next line as the break's optional `[<dimen>]` argument
 *     (e.g. an entry beginning "[2021] …" would otherwise raise "Illegal unit of
 *     measure").
 * Values are trimmed by the build schema, so a break never lands at the very
 * start of a paragraph, where a bare `\\` would raise "There's no line here to
 * end". Surrounding spaces/tabs are absorbed so indentation in the textarea does
 * not leak extra whitespace into the output.
 */
function withLineBreaks(escaped: string): string {
  return escaped.replace(/[ \t]*(?:\r?\n)+[ \t]*/g, '\\\\{}');
}

/** Escapes a value and preserves its line structure — the merge-time transform. */
function toLatexText(value: string): string {
  return withLineBreaks(escapeLatex(value));
}

interface SourceSegment {
  text: string;
  isComment: boolean;
}

/**
 * Splits a template source into code and comment runs, preserving every
 * character so the parts can be joined back into the exact original.
 *
 * A `%` opens a comment that ends at the newline, unless it is the character of
 * an escaped percent: `\%` is literal text, while `\\%` and `\foo%` are a
 * control sequence followed by a real comment. Both cases fall out of consuming
 * control sequences left to right, which is what the loop below does.
 *
 * Comments are handled separately everywhere below because they are inert: TeX
 * discards them. Substituting a placeholder inside one would be wrong twice
 * over — the value is thrown away, and a multi-line value ends its comment line
 * and spills the remaining lines into the preamble.
 */
function splitCodeAndComments(source: string): SourceSegment[] {
  const segments: SourceSegment[] = [];
  let buffer = '';
  let i = 0;

  const flushCode = () => {
    if (buffer !== '') segments.push({ text: buffer, isComment: false });
    buffer = '';
  };

  while (i < source.length) {
    const char = source[i];
    if (char === '\\') {
      // Consume the control sequence so an escaped percent stays literal.
      buffer += char;
      i += 1;
      if (i >= source.length) break;
      const next = source[i];
      if (/[A-Za-z]/.test(next)) {
        while (i < source.length && /[A-Za-z]/.test(source[i])) {
          buffer += source[i];
          i += 1;
        }
      } else {
        buffer += next;
        i += 1;
      }
      continue;
    }
    if (char === '%') {
      flushCode();
      let comment = char;
      i += 1;
      while (i < source.length && source[i] !== '\n') {
        comment += source[i];
        i += 1;
      }
      segments.push({ text: comment, isComment: true });
      continue;
    }
    buffer += char;
    i += 1;
  }
  flushCode();
  return segments;
}

/**
 * The source with every comment replaced by spaces, keeping the length so any
 * offsets still line up. The validator runs on this: a blocked primitive named
 * in a comment is never executed, and an admin documenting `{{fullName}}` at the
 * top of a template should not be told the template is broken.
 */
function codeWithoutComments(source: string): string {
  return splitCodeAndComments(source)
    .map((segment) =>
      segment.isComment ? ' '.repeat(segment.text.length) : segment.text,
    )
    .join('');
}

// A placeholder is `{{name}}` where name is a plain identifier. The identifier
// rule is what keeps standard LaTeX macro bodies intact: the ubiquitous
// `\newcommand{\resumeItem}[1]{\item{{#1}}}` contains `{{#1}}`, which is macro
// grouping around parameter #1, not a placeholder request.
const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
// A `{{name` that never closes. Requiring a letter after `{{` is what keeps this
// from firing on `{{#1}}`.
const UNCLOSED_PLACEHOLDER_PATTERN = /\{\{\s*[A-Za-z]/;

/**
 * Replaces `{{placeholder}}` tokens with escaped values. Unknown tokens are
 * filled with an empty string; callers validate the source with
 * `validateTemplateSource` first so unknown tokens never reach a compile.
 * Tokens inside a LaTeX comment are left alone, so documenting the available
 * placeholders in a template header cannot inject user content into the
 * preamble.
 */
export function mergeTemplate(
  source: string,
  data: Partial<Record<CvTemplatePlaceholder, string>>,
): string {
  return splitCodeAndComments(source)
    .map((segment) => {
      if (segment.isComment) return segment.text;
      return segment.text.replace(
        PLACEHOLDER_PATTERN,
        (_match, name: string) => {
          const key = name.trim() as CvTemplatePlaceholder;
          const value = data[key];
          return value === undefined ? '' : toLatexText(value);
        },
      );
    })
    .join('');
}

/**
 * Returns the placeholder names used by a template source. Tokens inside a
 * comment do not count: they are never substituted, so they are never used.
 * Throws LatexTemplateError for an unclosed `{{` token.
 */
export function extractPlaceholders(source: string): string[] {
  const names: string[] = [];
  const leftover = splitCodeAndComments(source)
    .map((segment) => {
      if (segment.isComment) return '';
      return segment.text.replace(
        PLACEHOLDER_PATTERN,
        (_match, name: string) => {
          names.push(name.trim());
          return '';
        },
      );
    })
    .join('');
  if (UNCLOSED_PLACEHOLDER_PATTERN.test(leftover)) {
    throw new LatexTemplateError(
      'Unbalanced placeholder — use {{placeholder}} exactly',
    );
  }
  return names;
}

/**
 * Rejects `\usepackage` of anything outside ALLOWED_LATEX_PACKAGES. A
 * `\usepackage` we cannot parse is rejected too, so a malformed or obfuscated
 * line never reaches the compiler as a surprise.
 */
function assertAllowedPackages(source: string): void {
  const declared = source.match(/\\usepackage\b/g)?.length ?? 0;
  const pattern = /\\usepackage\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
  let parsed = 0;
  let match = pattern.exec(source);
  while (match !== null) {
    parsed += 1;
    for (const raw of match[1].split(',')) {
      const name = raw.trim().toLowerCase();
      if (!ALLOWED_LATEX_PACKAGES.has(name)) {
        throw new LatexTemplateError(
          `Template may not load the LaTeX package "${raw.trim()}"`,
        );
      }
    }
    match = pattern.exec(source);
  }
  if (parsed !== declared) {
    throw new LatexTemplateError(
      'Template has an unreadable \\usepackage line',
    );
  }
}

/**
 * Validates an admin-authored template: no file/shell primitives, only
 * allowlisted packages, and every placeholder must belong to the fixed set above.
 * The primitive and package checks run on the source with comments blanked out,
 * since TeX never executes a comment.
 * Returns the distinct placeholders the template uses.
 */
export function validateTemplateSource(source: string): string[] {
  const code = codeWithoutComments(source);
  const forbidden = code.match(FORBIDDEN_LATEX_PATTERN)?.[0];
  if (forbidden) {
    throw new LatexTemplateError(
      `Template uses forbidden LaTeX primitive ${forbidden}`,
    );
  }
  assertAllowedPackages(code);
  const placeholders = extractPlaceholders(source);
  const unknown = placeholders.filter((name) => !PLACEHOLDER_SET.has(name));
  if (unknown.length > 0) {
    throw new LatexTemplateError(
      `Unknown placeholder ${unknown[0]} — allowed: ${CV_TEMPLATE_PLACEHOLDERS.map((p) => `{{${p}}}`).join(', ')}`,
    );
  }
  return [...new Set(placeholders)];
}

// Sample data used to render a template with no user input: the admin Preview
// action and the Phase 6 live preview both compile a template against this so an
// admin sees a realistic document before activating it. Values deliberately
// include LaTeX special characters so the preview also demonstrates escaping.
// Shared from here so the admin service and the preview service never diverge.
export const CV_TEMPLATE_SAMPLE_DATA: Record<CvTemplatePlaceholder, string> = {
  fullName: 'Ada Lovelace',
  headline: 'Senior Full-Stack Engineer',
  profile:
    'Full-stack engineer with 8 years building dependable web platforms. I care about clear APIs, fast feedback loops and shipping software that lasts.',
  email: 'ada.lovelace@example.com',
  phone: '+33 6 12 34 56 78',
  links: 'linkedin.com/in/adalovelace — github.com/adalovelace',
  experience:
    'Senior Engineer, Analytical Engines Ltd (2021 – Present)\nShipped a R&D platform used by 40+ teams.',
  education: 'MSc Mathematics, University of London (2015 – 2018)',
  certificates:
    'AWS Certified Solutions Architect (2023)\nCertified Kubernetes Administrator (2022)',
  skills: 'TypeScript, React, Node.js, PostgreSQL, Docker',
};

// Human documentation for each placeholder, shared by the admin field-reference
// panel and the placeholder catalogue endpoint so the admin editor and the API
// never describe a field differently. `multiline` marks the fields the builder
// renders as a textarea and where each newline becomes its own line in the PDF
// (see {@link withLineBreaks}). Mirrors the user-facing labels/hints in the CV
// Builder form; per-field length caps stay in latex-build.schemas.ts.
export const CV_TEMPLATE_FIELD_META: Record<
  CvTemplatePlaceholder,
  { label: string; hint: string; multiline: boolean }
> = {
  fullName: {
    label: 'Full name',
    hint: 'As it should appear at the top of the CV',
    multiline: false,
  },
  headline: {
    label: 'Headline',
    hint: 'One line under the name, e.g. Senior Full-Stack Engineer',
    multiline: false,
  },
  profile: {
    label: 'Profile',
    hint: 'A short summary paragraph about you, e.g. your background and what you are looking for',
    multiline: true,
  },
  email: { label: 'Email', hint: 'Contact email address', multiline: false },
  phone: { label: 'Phone', hint: 'Contact phone number', multiline: false },
  links: {
    label: 'Links',
    hint: 'LinkedIn, GitHub, portfolio… one per line',
    multiline: true,
  },
  experience: {
    label: 'Experience',
    hint: 'One entry per line, e.g. Engineer, ACME (2021 – Present)',
    multiline: true,
  },
  education: {
    label: 'Education',
    hint: 'One entry per line, e.g. MSc Mathematics, University of London',
    multiline: true,
  },
  certificates: {
    label: 'Certificates',
    hint: 'One certificate per line, e.g. AWS Certified Solutions Architect (2023)',
    multiline: true,
  },
  skills: {
    label: 'Skills',
    hint: 'Comma-separated, or one skill group per line',
    multiline: true,
  },
};
