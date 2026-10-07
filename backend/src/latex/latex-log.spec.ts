import { summarizeLatexFailure } from './latex-log';

// Trimmed from a real pdflatex transcript. The log names input.tex with an
// absolute container path in practice; the basename is what the patterns use.
const UNDEFINED_SEQUENCE = `This is pdfTeX, Version 3.141592653-2.6-1.40.26 (TeX Live 2022)
entering extended mode
(/usr/share/texlive/texmf-dist/tex/latex/base/article.cls
LaTeX2e <2022-11-01>
! Undefined control sequence.
l.12 \\notacommand
         {foo}
`;
const MISSING_PACKAGE = `! LaTeX Error: File \`nosuchpkg.sty' not found.

Type X to quit or <RETURN> to proceed,
or enter new name. (Default extension: sty)

Enter file name:
! Emergency stop.
<read *>
`;
const FILE_REPORTED = `/job/input.tex:23: LaTeX Error: \\begin{document} ended by \\end{foo}.

See the LaTeX manual or LaTeX Companion for explanation.
Type  H <return>  for immediate help.
...
l.23 \\end{foo}
`;

// Both of these come from real transcripts that also end in pdflatex's fatal
// "no output PDF file produced!" line. That trailing line is a symptom, so the
// specific cause has to win the match — otherwise the admin is told the PDF is
// missing instead of what to change in their template.
const MISSING_ITEM = `(/usr/share/texlive/texmf-dist/tex/latex/base/article.cls)
! LaTeX Error: Something's wrong--perhaps a missing \\item.

See the LaTeX manual or LaTeX Companion for explanation.
Type  H <return>  for immediate help.
 ...

l.73 \\end{itemize}

!  ==> Fatal error occurred, no output PDF file produced!
`;
const SECOND_DOCUMENTCLASS = `! LaTeX Error: Can be used only in preamble.

See the LaTeX manual or LaTeX Companion for explanation.
Type  H <return>  for immediate help.
 ...

l.40 \\documentclass[10pt,a4paper]{article}

!  ==> Fatal error occurred, no output PDF file produced!
`;

const log = (text: string) => Buffer.from(text, 'utf8');

describe('summarizeLatexFailure', () => {
  it('names the offending line for an undefined control sequence', () => {
    expect(summarizeLatexFailure(log(UNDEFINED_SEQUENCE))).toEqual({
      line: 12,
      message: expect.stringContaining('Unknown LaTeX command'),
    });
  });

  it('explains a package that is not installed', () => {
    const failure = summarizeLatexFailure(log(MISSING_PACKAGE));
    expect(failure?.message).toContain('not installed in the sandbox');
  });

  // pdflatex reports the same failure in two shapes; both have to locate the line.
  it('reads the line from the input.tex:NN form too', () => {
    expect(summarizeLatexFailure(log(FILE_REPORTED))).toEqual({
      line: 23,
      message: expect.stringContaining('\\begin{document}'),
    });
  });

  // Regression: a placeholder dropped straight into an itemize (no \item) is a
  // fatal pdflatex error whose last line is "no output PDF file produced!". The
  // whitelist used to report only that symptom.
  it('names the missing \\item instead of the missing PDF', () => {
    expect(summarizeLatexFailure(log(MISSING_ITEM))).toEqual({
      line: 73,
      message: expect.stringContaining('needs \\item before its content'),
    });
    expect(summarizeLatexFailure(log(MISSING_ITEM))?.message).not.toContain(
      'produced no PDF',
    );
  });

  // Regression: two templates pasted into one source give a second
  // \documentclass, which is also fatal and also ends in "no output PDF".
  it('names the extra \\documentclass instead of the missing PDF', () => {
    expect(summarizeLatexFailure(log(SECOND_DOCUMENTCLASS))).toEqual({
      line: 40,
      message: expect.stringContaining('Remove the extra \\documentclass'),
    });
  });

  it('returns a generic message with no line when the log says nothing useful', () => {
    expect(summarizeLatexFailure(log('something odd happened'))).toEqual({
      message: 'The template could not be compiled.',
    });
  });

  it('returns null when there is no log at all', () => {
    expect(summarizeLatexFailure(undefined)).toBeNull();
    expect(summarizeLatexFailure(null)).toBeNull();
    expect(summarizeLatexFailure(Buffer.alloc(0))).toBeNull();
    expect(summarizeLatexFailure(log('   \n  '))).toBeNull();
  });

  // The log carries container paths and template text. None of it may escape.
  it('never echoes log content back to the caller', () => {
    const leaky = `! Undefined control sequence.
l.7 \\input{/etc/passwd}
SecretToken=hunter2
`;
    const failure = summarizeLatexFailure(log(leaky));
    expect(JSON.stringify(failure)).not.toContain('hunter2');
    expect(JSON.stringify(failure)).not.toContain('/etc/passwd');
    expect(JSON.stringify(failure)).not.toContain('usr/share');
  });

  it('ignores a line number of zero or below', () => {
    expect(summarizeLatexFailure(log('l.0 \\foo'))).not.toHaveProperty('line');
  });

  it('does not choke on a very large log', () => {
    const huge = `${'x'.repeat(400 * 1024)}\nl.42 \\foo`;
    expect(summarizeLatexFailure(log(huge))?.line).toBe(42);
  });
});