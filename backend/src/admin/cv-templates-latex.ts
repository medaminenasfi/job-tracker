// LaTeX handling for MVP3 CV templates.
//
// Two non-negotiable rules from the roadmap live here:
// 1. Values (CV/profile content) are NEVER interpreted as LaTeX — every value is
//    escaped to literal text before substitution.
// 2. Template sources are restricted to a small, fixed placeholder set and may
//    not embed file/shell-escaping primitives.

// The complete placeholder set a template may use. Documented for admins via
// GET /admin/cv-templates/placeholders and mirrored in the admin UI.
export const CV_TEMPLATE_PLACEHOLDERS = [
  'fullName',
  'headline',
  'email',
  'phone',
  'links',
  'experience',
  'education',
  'skills',
] as const;

export type CvTemplatePlaceholder = (typeof CV_TEMPLATE_PLACEHOLDERS)[number];

const PLACEHOLDER_SET = new Set<string>(CV_TEMPLATE_PLACEHOLDERS);

// TeX primitives that read/write files, read from the terminal, or escape to the
// shell. Templates are compiled against a fixed preamble, so a legitimate
// template never needs one of these.
const FORBIDDEN_LATEX_PRIMITIVES = [
  '\\input',
  '\\include',
  '\\usepackage',
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
 * literal text. This is the actual LaTeX-injection defense; the Phase 4 sandbox
 * is defense-in-depth on top of it.
 */
export function escapeLatex(value: string): string {
  return value.replace(/[\\{}$&#_%~^]/g, (char) => LATEX_ESCAPES[char] ?? char);
}

const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;

/**
 * Replaces `{{placeholder}}` tokens with escaped values. Unknown tokens are
 * filled with an empty string; callers validate the source with
 * `validateTemplateSource` first so unknown tokens never reach a compile.
 */
export function mergeTemplate(
  source: string,
  data: Partial<Record<CvTemplatePlaceholder, string>>,
): string {
  return source.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    const key = name.trim() as CvTemplatePlaceholder;
    const value = data[key];
    return value === undefined ? '' : escapeLatex(value);
  });
}

/**
 * Returns the placeholder names used by a template source.
 * Throws LatexTemplateError for an unclosed `{{` token.
 */
export function extractPlaceholders(source: string): string[] {
  const names: string[] = [];
  const leftover = source.replace(
    PLACEHOLDER_PATTERN,
    (_match, name: string) => {
      names.push(name.trim());
      return '';
    },
  );
  if (leftover.includes('{{')) {
    throw new LatexTemplateError(
      'Unbalanced placeholder — use {{placeholder}} exactly',
    );
  }
  return names;
}

/**
 * Validates an admin-authored template: no file/shell primitives, and every
 * placeholder must belong to the fixed set above.
 * Returns the distinct placeholders the template uses.
 */
export function validateTemplateSource(source: string): string[] {
  const forbidden = FORBIDDEN_LATEX_PRIMITIVES.find((primitive) =>
    source.includes(primitive),
  );
  if (forbidden) {
    throw new LatexTemplateError(
      `Template uses forbidden LaTeX primitive ${forbidden}`,
    );
  }
  const placeholders = extractPlaceholders(source);
  const unknown = placeholders.filter((name) => !PLACEHOLDER_SET.has(name));
  if (unknown.length > 0) {
    throw new LatexTemplateError(
      `Unknown placeholder ${unknown[0]} — allowed: ${CV_TEMPLATE_PLACEHOLDERS.map((p) => `{{${p}}}`).join(', ')}`,
    );
  }
  return [...new Set(placeholders)];
}
