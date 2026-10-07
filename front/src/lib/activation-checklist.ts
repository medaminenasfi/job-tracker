// What has to be true before a template is offered to users.
//
// Why a checklist rather than a single "you can't activate yet" error: an admin
// pressing Activate and getting nothing back has no idea what to fix. Every
// reason is listed at once, so one pass through the editor is enough.
//
// The three requirements are ordered by how cheap they are to notice, and each
// carries its own missing-item detail — "uses unknown placeholders: projects,
// languages" tells the admin which tokens to fix, where a bare "invalid
// placeholders" would not.

/** The placeholder set the API documents; mirrors CV_TEMPLATE_PLACEHOLDERS. */
const DOCUMENTED_PLACEHOLDERS = new Set([
  'fullName',
  'headline',
  'email',
  'phone',
  'links',
  'experience',
  'education',
  'skills',
]);

/** Matches `{{name}}`, tolerating the internal whitespace TeX authoring uses. */
const PLACEHOLDER_RE = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

/** Every distinct placeholder token in a template source, in source order. */
export function templatePlaceholders(source: string): string[] {
  // Array.from rather than a spread: the project targets ES5, where spreading
  // an iterator is a compile error.
  const found: string[] = [];
  const seen = new Set<string>();
  PLACEHOLDER_RE.lastIndex = 0;
  let match = PLACEHOLDER_RE.exec(source);
  while (match) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      found.push(name);
    }
    match = PLACEHOLDER_RE.exec(source);
  }
  return found;
}

/** Placeholders the API does not document, in source order. */
export function undocumentedPlaceholders(source: string): string[] {
  return templatePlaceholders(source).filter(
    (name) => !DOCUMENTED_PLACEHOLDERS.has(name),
  );
}

export interface ActivationChecklist {
  /** Requirements met, in the order they are displayed. */
  met: string[];
  /** Everything still blocking activation, phrased as instructions. */
  missing: string[];
}

/**
 * Evaluates the pre-activation requirements for a template.
 *
 * @param name            The name users will see in the gallery.
 * @param source          The LaTeX source as authored.
 * @param compiledOk      Whether a Preview has compiled this exact source
 *                         successfully at least once in this session. A template
 *                         that never rendered may reference a package the
 *                         sandbox lacks, so it must not be activated blind.
 */
export function activationChecklist(
  name: string,
  source: string,
  compiledOk: boolean,
): ActivationChecklist {
  const met: string[] = [];
  const missing: string[] = [];

  if (name.trim()) {
    met.push('Has a name');
  } else {
    missing.push('Give it a name users will recognise in the gallery.');
  }

  if (compiledOk) {
    met.push('Preview compiles');
  } else {
    missing.push('Save a preview that compiles before activating.');
  }

  const unknown = undocumentedPlaceholders(source);
  if (unknown.length === 0) {
    met.push('Uses only documented placeholders');
  } else {
    const list = unknown.map((name) => `{{${name}}}`).join(', ');
    missing.push(
      `Replace the undocumented placeholder${unknown.length === 1 ? '' : 's'}: ${list}.`,
    );
  }

  return { met, missing };
}