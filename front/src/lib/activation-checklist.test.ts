import { describe, expect, it } from 'vitest';
import {
  activationChecklist,
  templatePlaceholders,
  undocumentedPlaceholders,
} from './activation-checklist';

const GOOD = '\\documentclass{article}\n{{fullName}}';

describe('templatePlaceholders', () => {
  it('lists each distinct placeholder once, in source order', () => {
    expect(
      templatePlaceholders('{{fullName}} {{skills}} {{fullName}}'),
    ).toEqual(['fullName', 'skills']);
  });

  it('tolerates the whitespace TeX authors put inside braces', () => {
    expect(templatePlaceholders('{{ fullName }}')).toEqual(['fullName']);
    expect(templatePlaceholders('{{fullName  }}')).toEqual(['fullName']);
  });

  it('ignores braces that are not a placeholder', () => {
    expect(templatePlaceholders('\\{ not a placeholder \\}')).toEqual([]);
  });

  it('returns nothing for an empty template', () => {
    expect(templatePlaceholders('')).toEqual([]);
  });
});

describe('undocumentedPlaceholders', () => {
  it('reports only the ones the API does not document', () => {
    expect(undocumentedPlaceholders('{{fullName}} {{projects}}')).toEqual([
      'projects',
    ]);
  });

  it('accepts every documented placeholder', () => {
    const all = [
      'fullName',
      'headline',
      'email',
      'phone',
      'links',
      'experience',
      'education',
      'skills',
    ];
    expect(undocumentedPlaceholders(all.map((n) => `{{${n}}}`).join(' '))).toEqual(
      [],
    );
  });
});

describe('activationChecklist', () => {
  it('passes everything for a named, compiling, documented template', () => {
    const result = activationChecklist('Classic', GOOD, true);
    expect(result.missing).toEqual([]);
    expect(result.met).toHaveLength(3);
  });

  // Each requirement fails on its own, so a partial state is diagnosable.
  it('reports a missing name as a rename instruction', () => {
    const result = activationChecklist('   ', GOOD, true);
    expect(result.missing).toEqual([
      'Give it a name users will recognise in the gallery.',
    ]);
    expect(result.met).not.toContain('Has a name');
  });

  it('requires a preview that actually compiled', () => {
    const result = activationChecklist('Classic', GOOD, false);
    expect(result.missing).toContain(
      'Save a preview that compiles before activating.',
    );
  });

  // The most useful case: name the specific tokens, not just "invalid".
  it('names every undocumented placeholder it found', () => {
    const result = activationChecklist(
      'Classic',
      '{{fullName}} {{projects}} {{languages}}',
      true,
    );
    expect(result.missing).toEqual([
      'Replace the undocumented placeholders: {{projects}}, {{languages}}.',
    ]);
  });

  it('uses the singular form for a single bad placeholder', () => {
    const result = activationChecklist('Classic', '{{projects}}', true);
    expect(result.missing).toEqual([
      'Replace the undocumented placeholder: {{projects}}.',
    ]);
  });

  // One pass should fix everything, so all blockers are listed together.
  it('lists every blocker at once rather than one at a time', () => {
    const result = activationChecklist('', '{{projects}}', false);
    expect(result.missing).toHaveLength(3);
    expect(result.met).toEqual([]);
  });
});