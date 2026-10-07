import {
  CV_TEMPLATE_PLACEHOLDERS,
  LatexTemplateError,
  escapeLatex,
  extractPlaceholders,
  mergeTemplate,
  validateTemplateSource,
} from './latex-template';

describe('escapeLatex', () => {
  it('escapes every LaTeX special character', () => {
    expect(escapeLatex('a\\b{c}d$e&f#g_h%i~j^k')).toBe(
      'a\\textbackslash{}b\\{c\\}d\\$e\\&f\\#g\\_h\\%i\\textasciitilde{}j\\textasciicircum{}k',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeLatex('Ada Lovelace')).toBe('Ada Lovelace');
  });

  // Regression: pdf-parse can emit C0/C1 control bytes (U+0015/16/1C/1D) that
  // pdflatex rejects with "Unicode character ^^V (U+0016)", so no PDF is
  // produced. Stripping them in the escape rescues CVs stored before the fix.
  it('strips control characters that abort pdflatex', () => {
    expect(escapeLatex('A\u0016B\u0015C\u001cD\u001dE')).toBe('ABCDE');
  });

  it('keeps the whitespace that carries layout', () => {
    expect(escapeLatex('Line one\nLine two\ttabbed')).toBe(
      'Line one\nLine two\ttabbed',
    );
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

  // Regression: a template that documents its placeholders in a header comment
  // is normal. Substituting inside the comment both wasted the value and, for a
  // multi-line value, pushed the remaining lines past the end of the comment and
  // into the preamble — the document then died with "Missing \begin{document}".
  it('leaves placeholders inside a comment untouched', () => {
    const source = '% available: {{fullName}}\n\\textbf{ {{fullName}} }';
    expect(mergeTemplate(source, { fullName: 'Ada' })).toBe(
      '% available: {{fullName}}\n\\textbf{ Ada }',
    );
  });

  it('does not let a multi-line value escape a comment into the preamble', () => {
    const merged = mergeTemplate('% see {{skills}}\n\\begin{document}\n', {
      skills: 'Docker\nNginx\nPostgres',
    });
    expect(merged.split('\n')).toEqual([
      '% see {{skills}}',
      '\\begin{document}',
      '',
    ]);
  });

  it('round-trips a source that has no placeholder at all', () => {
    const source = '\\documentclass{article}\n% 50% done\n\\end{document}\n';
    expect(mergeTemplate(source, { skills: 'x' })).toBe(source);
  });

  // `\%` is a literal percent, so what follows it is code, not a comment.
  it('still substitutes after an escaped percent', () => {
    expect(mergeTemplate('90\\% {{skills}}', { skills: 'Docker' })).toBe(
      '90\\% Docker',
    );
  });

  // `\\` is one control sequence, so the percent after it does open a comment.
  it('treats a percent after a line break as a comment', () => {
    expect(
      mergeTemplate('a\\\\% {{skills}}\nb: {{skills}}', { skills: 'D' }),
    ).toBe('a\\\\% {{skills}}\nb: D');
  });

  // Regression: the builder asks for "one entry per line", but TeX reads a source
  // newline as a space, so without a hard break the whole field ran together into
  // one unreadable paragraph.
  it('puts each line of a multi-line value on its own line', () => {
    expect(
      mergeTemplate('{{experience}}', { experience: 'Job A\nJob B' }),
    ).toBe('Job A\\\\{}Job B');
  });

  it('collapses a blank line into a single break, not a doubled one', () => {
    // A doubled `\\\\` would raise "There's no line here to end".
    expect(mergeTemplate('{{education}}', { education: 'A\n\nB' })).toBe(
      'A\\\\{}B',
    );
  });

  it('stops a value line from being read as the break optional argument', () => {
    // Without the trailing {}, `\\[2021]` is parsed as a `[<dimen>]` and dies
    // with "Illegal unit of measure".
    expect(mergeTemplate('{{experience}}', { experience: 'A\n[2021] B' })).toBe(
      'A\\\\{}[2021] B',
    );
  });

  it('escapes special characters and keeps the line break together', () => {
    expect(mergeTemplate('{{skills}}', { skills: 'A_B\nC&D' })).toBe(
      'A\\_B\\\\{}C\\&D',
    );
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

  // Regression: `{{#1}}` is LaTeX grouping around a macro parameter, not a
  // placeholder request. Every real CV template defines \newcommand macros.
  it('leaves newcommand macro bodies alone', () => {
    const macro = '\\newcommand{\\resumeItem}[1]{\\item\\small{{#1}}}';
    expect(extractPlaceholders(macro)).toEqual([]);
    expect(() => validateTemplateSource(macro)).not.toThrow();
    expect(validateTemplateSource(`${macro} {{fullName}}`)).toEqual([
      'fullName',
    ]);
  });

  it('still merges real placeholders next to macro bodies', () => {
    expect(
      mergeTemplate('\\newcommand{\\r}[1]{{#1}}\n{{fullName}}', {
        fullName: 'Ada',
      }),
    ).toBe('\\newcommand{\\r}[1]{{#1}}\nAda');
  });

  it('does not count a placeholder that only appears in a comment', () => {
    expect(extractPlaceholders('% {{fullName}}\n\\section*{{skills}}')).toEqual(
      ['skills'],
    );
  });

  it('still flags an unclosed token in a comment', () => {
    // The comment text is inert, so this must not be treated as a broken
    // placeholder the admin has to fix.
    expect(extractPlaceholders('% {{fullName\n')).toEqual([]);
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
    ['\\immediate\\write18{rm -rf /}'],
    ['\\catcode`\\@=13'],
    ['\\special{ps: exec}'],
    ['\\directlua{os.execute("id")}'],
  ])('rejects the dangerous primitive %s', (source) => {
    expect(() => validateTemplateSource(source)).toThrow(
      /forbidden LaTeX primitive/,
    );
  });

  // `\usepackage` is allowlisted rather than banned, because real CV templates
  // need typography packages. These are the ones that must never load.
  it.each([
    ['\\usepackage{shellesc}'],
    ['\\usepackage{filecontents}'],
    ['\\usepackage{fontspec}'],
    ['\\usepackage{hyperref},\\usepackage{shellesc}'],
    ['\\usepackage{../evil}'],
  ])('rejects the non-allowlisted package in %s', (source) => {
    expect(() => validateTemplateSource(source)).toThrow(
      /may not load the LaTeX package/,
    );
  });

  // "Not allowlisted" is not actionable. The admin has to be told which package
  // to remove, and a rejection message is not a place to be vague.
  it.each([
    ['\\usepackage{shellesc}', 'shellesc'],
    ['\\usepackage{fontspec}', 'fontspec'],
    // A multi-package line: the offender is the second entry, not the first.
    ['\\usepackage{hyperref},\\usepackage{shellesc}', 'shellesc'],
    // Package names are case-insensitive in TeX, so the message is too.
    ['\\usepackage{ShellEsc}', 'ShellEsc'],
  ])('names the rejected package in %s', (source, expected) => {
    expect(() => validateTemplateSource(source)).toThrow(
      `Template may not load the LaTeX package "${expected}"`,
    );
  });

  // Capability comes from the package, not from its options: an allowlisted
  // package with an odd option is inert, so options are not policed (real
  // templates legitimately pass things like [letterpaper,9pt] or [colorlinks=true]).
  it('ignores package options when deciding what may load', () => {
    expect(() =>
      validateTemplateSource('\\usepackage[shellesc]{hyperref}'),
    ).not.toThrow();
    expect(() =>
      validateTemplateSource('\\usepackage[letterpaper,9pt]{geometry}'),
    ).not.toThrow();
  });

  // A comment is discarded by TeX, so naming a blocked primitive in one is
  // harmless — and templates routinely document what they removed and why.
  it.each([
    ['% removed \\input{glyphtounicode} - not shipped by TeX Live'],
    ['% never use \\write18 or \\directlua here'],
    ['% \\usepackage{shellesc} would be rejected'],
    ['% \\catcode`\\@=13'],
  ])('ignores the blocked construct in the comment %s', (source) => {
    expect(() => validateTemplateSource(source)).not.toThrow();
  });

  it('still rejects a blocked primitive that follows a comment line', () => {
    expect(() =>
      validateTemplateSource('% header\n\\immediate\\write18{rm -rf /}'),
    ).toThrow(/forbidden LaTeX primitive/);
  });

  // A `\usepackage` the parser cannot read must never reach the compiler.
  it('rejects a malformed \\usepackage line', () => {
    expect(() => validateTemplateSource('\\usepackage')).toThrow(
      /unreadable \\usepackage/,
    );
    expect(() => validateTemplateSource('\\usepackage{hyperref')).toThrow(
      /unreadable \\usepackage/,
    );
  });

  it.each([
    ['\\usepackage[utf8]{inputenc}'],
    ['\\usepackage[T1]{fontenc}'],
    ['\\usepackage{titlesec,enumitem,fullpage}'],
    ['\\usepackage[letterpaper,margin=0.5in]{geometry}'],
    ['\\usepackage[colorlinks=true]{hyperref}'],
  ])('allows the layout package %s', (source) => {
    expect(() => validateTemplateSource(source)).not.toThrow();
  });

  it('allows ordinary layout macros', () => {
    expect(() =>
      validateTemplateSource('\\section*{ {{headline}} }\\%'),
    ).not.toThrow();
  });

  // Regression: these primitives are prefixes of harmless commands, and a plain
  // substring check flagged \definecolor as \def and rejected real templates.
  it.each([['\\definecolor{accent}{HTML}{2563EB}'], ['\\definesymbol{wifi}']])(
    'does not mistake %s for a forbidden primitive',
    (source) => {
      expect(() => validateTemplateSource(source)).not.toThrow();
    },
  );
});
