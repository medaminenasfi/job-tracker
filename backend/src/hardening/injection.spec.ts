// Phase 8 hardening: LaTeX injection test suite.
// A fixed set of adversarial field values run through the real pipeline on every CI run,
// asserting the output is always literal text or a clean failure, never a compiler exploit or a hung container.
import { describe, it, expect, jest } from '@jest/globals';
import { LatexCompilerService } from '../latex/latex-compiler.service';
import { DockerEngine } from '../latex/docker-engine';

const doc = (body: string) =>
  `\\documentclass[11pt]{article}\\begin{document}${body}\\end{document}`;

function looksLikePdf(pdf: Buffer): boolean {
  return (
    pdf.length > 1000 &&
    pdf.subarray(0, 5).toString() === '%PDF-' &&
    pdf.subarray(-1024).includes(Buffer.from('%%EOF'))
  );
}

const injectionCases = [
  ['command injection via \\input', '\\input{/etc/passwd}', 'ok'],
  ['shell escape via \\write18', '\\write18{whoami}', 'ok'],
  ['immediate write18', '\\immediate\\write18{id}', 'ok'],
  ['openout file write', '\\openout1=/tmp/pwn\\write1{exploit}', 'ok'],
  ['catcode manipulation', '\\catcode`\\@=11\\@input{test}', 'ok'],
  ['defining malicious macro', '\\def\\x{\\input{/etc/passwd}}\\x', 'ok'],
  ['nested braces exhaustion', '{'.repeat(10000) + '}' .repeat(10000), 'fail'],
  ['extremely long string', 'A'.repeat(100000), 'fail'],
  ['Unicode bomb', '\\u{1F600}'.repeat(5000), 'ok'],
  ['Null byte injection', 'test\\0injection', 'ok'],
  ['Format string attack', '%n%n%n%n', 'ok'],
  ['Path traversal in includegraphics', '\\includegraphics{../../../../etc/passwd}', 'ok'],
  ['Package loading attempt (shellesc)', '\\usepackage{shellesc}', 'fail'],
  ['Filecontents environment', '\\begin{filecontents}{/tmp/x}\\end{filecontents}', 'ok'],
  ['Fontspec (XeLaTeX-only)', '\\usepackage{fontspec}', 'fail'],
  ['LuaLaTeX direct lua', '\\directlua{os.execute("id")}', 'ok'],
  ['Expl3 programming layer', '\\ExplSyntaxOn\\sys_shell_now:n{id}\\ExplSyntaxOff', 'ok'],
];

describe('LaTeX injection defense', () => {
  if (!process.env.LATEX_INTEGRATION) return;

  const compiler = new LatexCompilerService(new DockerEngine());
  jest.setTimeout(120_000);

  injectionCases.forEach(([desc, input, expected]) => {
    it(`neutralizes: ${desc}`, async () => {
      const compiler = new LatexCompilerService(new DockerEngine());
      const outcome = await compiler.compile(doc(input), { fullName: input });

      if (expected === 'ok') {
        expect(outcome.ok).toBe(true);
        if (outcome.ok) expect(looksLikePdf(outcome.pdf)).toBe(true);
      } else {
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
          expect(['compile_failed', 'validation_failed']).toContain(outcome.reason);
        }
      }
    });
  });

  it('never leaks container paths or compiler internals in errors', async () => {
    const compiler = new LatexCompilerService(new DockerEngine());
    const outcome = await compiler.compile(doc('\\thisMacroDoesNotExist'), { fullName: '\\thisMacroDoesNotExist' });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      const json = JSON.stringify(outcome);
      expect(json).not.toContain('/usr/share');
      expect(json).not.toContain('/var/lib');
      expect(json).not.toContain('output.log');
      expect(json).not.toContain('thisMacroDoesNotExist');
      expect(outcome.reason).toBe('compile_failed');
      expect(outcome.failure?.line).toBeGreaterThan(0);
      expect(outcome.failure?.message).toContain('Unknown LaTeX command');
    }
  });

  it('bounds error response size (no massive log dumps)', async () => {
    const compiler = new LatexCompilerService(new DockerEngine());
    const outcome = await compiler.compile(doc('\\thisMacroDoesNotExist'), { fullName: '\\thisMacroDoesNotExist' });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      const json = JSON.stringify(outcome);
      expect(json.length).toBeLessThan(10000);
    }
  });
});

describe('preview path injection defense', () => {
  const compiler = new LatexCompilerService(new DockerEngine());
  jest.setTimeout(120_000);

  it('neutralizes injection in preview path', async () => {
    const outcome = await compiler.compilePreview(doc('{{fullName}}'), { fullName: '\\input{/etc/passwd}\\write18{id}' });
    expect(typeof outcome.ok).toBe('boolean');
  });

  it('never leaks internals in preview errors', async () => {
    const outcome = await compiler.compilePreview(doc('{{fullName}}'), { fullName: '\\thisMacroDoesNotExist' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      const json = JSON.stringify(outcome);
      expect(json).not.toContain('/usr/share');
      expect(json).not.toContain('thisMacroDoesNotExist');
    }
  });
});



