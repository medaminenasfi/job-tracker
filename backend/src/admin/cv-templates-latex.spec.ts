import {
  CV_TEMPLATE_PLACEHOLDERS,
  LatexTemplateError,
  escapeLatex,
  extractPlaceholders,
  mergeTemplate,
  validateTemplateSource,
} from './cv-templates-latex';

describe('escapeLatex', () => {
  it('escapes every LaTeX special character', () => {
    expect(escapeLatex('a\\b{c}d$e&f#g_h%i~j^k')).toBe(
      'a\\textbackslash{}b\\{c\\}d\\$e\\&f\\#g\\_h\\%i\\textasciitilde{}j\\textasciicircum{}k',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeLatex('Ada Lovelace')).toBe('Ada Lovelace');
  });
});

describe('mergeTemplate', () => {
  it('substitutes placeholders with escaped values', () => {
    const source = '\\textbf{ {{fullName}} } — {{email}}';
    const merged = mergeTemplate(source, {
      fullName: 'Ada_Lovelace',
      email: 'ada&co@example.com',
    });
    expect(merged).toBe('\\textbf{ Ada\\_Lovelace } — ada\\&co@example.com');
  });

  it('fills unused placeholders with an empty string', () => {
    expect(mergeTemplate('[{{skills}}][{{phone}}]', { skills: 'React' })).toBe(
      '[React][]',
    );
  });

  it('tolerates whitespace inside the token', () => {
    expect(mergeTemplate('{{  fullName  }}', { fullName: 'Ada' })).toBe('Ada');
  });
});

describe('extractPlaceholders', () => {
  it('returns the placeholder names in order', () => {
    expect(
      extractPlaceholders('{{fullName}}\n{{skills}}\n{{fullName}}'),
    ).toEqual(['fullName', 'skills', 'fullName']);
  });

  it('returns an empty list when no placeholder is used', () => {
    expect(extractPlaceholders('\\section*{Name}')).toEqual([]);
  });

  it('throws on an unclosed placeholder', () => {
    expect(() => extractPlaceholders('{{fullName')).toThrow(LatexTemplateError);
  });
});

describe('validateTemplateSource', () => {
  it('accepts a template using only the documented placeholders', () => {
    const source = CV_TEMPLATE_PLACEHOLDERS.map((p) => `{{${p}}}`).join('\n');
    expect(validateTemplateSource(source)).toEqual([
      ...CV_TEMPLATE_PLACEHOLDERS,
    ]);
  });

  it('rejects a placeholder outside the fixed set', () => {
    expect(() => validateTemplateSource('{{secret}}')).toThrow(
      /Unknown placeholder secret/,
    );
  });

  it.each([
    ['\\input{/etc/passwd}'],
    ['\\usepackage{shellesc}'],
    ['\\immediate\\write18{rm -rf /}'],
    ['\\catcode`\\@=13'],
    ['\\special{ps: exec}'],
    ['\\directlua{os.execute("id")}'],
  ])('rejects the dangerous primitive %s', (source) => {
    expect(() => validateTemplateSource(source)).toThrow(
      /forbidden LaTeX primitive/,
    );
  });

  it('allows ordinary layout macros', () => {
    expect(() =>
      validateTemplateSource('\\section*{ {{headline}} }\\%'),
    ).not.toThrow();
  });
});
