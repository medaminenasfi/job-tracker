/**
 * Real end-to-end check of the LaTeX sandbox. Skipped by default because it
 * needs the worker image built and the Docker socket reachable:
 *
 *   docker build -t jobtracker/latex-worker:latest worker/
 *   cd backend && LATEX_INTEGRATION=1 npx jest src/latex/latex-compiler.integration
 *
 * On Windows (Docker Desktop) point DOCKER_SOCKET at the named pipe:
 *   $env:DOCKER_SOCKET='\\\\.\\pipe\\docker_engine'
 *
 * NB: the assertions deliberately avoid pdf-parse — pdf.js 1.10 (bundled with
 * pdf-parse 1.x) can only be trusted for a single parse per process and reports
 * valid PDFs as "Invalid PDF structure" on later calls.
 */
import { DockerEngine } from './docker-engine';
import { LatexCompilerService } from './latex-compiler.service';

const integration =
  process.env.LATEX_INTEGRATION === '1' ? describe : describe.skip;

integration('LatexCompilerService with a real sandbox', () => {
  const compiler = new LatexCompilerService(new DockerEngine());
  jest.setTimeout(120_000);

  const doc = (body: string) =>
    `\\documentclass[11pt]{article}\\begin{document}${body}\\end{document}`;

  function looksLikePdf(pdf: Buffer): boolean {
    return (
      pdf.length > 1000 &&
      pdf.subarray(0, 5).toString() === '%PDF-' &&
      pdf.subarray(-1024).includes(Buffer.from('%%EOF'))
    );
  }

  it('reports the sandbox as available', async () => {
    await expect(compiler.isAvailable()).resolves.toBe(true);
  });

  it('renders a real PDF through the sandbox', async () => {
    const outcome = await compiler.compile(
      doc('\\section*{Ada Lovelace}\n{{headline}}\nEmail: {{email}}'),
      {
        fullName: 'Ada Lovelace',
        // Unescaped, these abort pdflatex: a successful build is itself proof
        // that every value was escaped before it reached the .tex source.
        headline: 'Engineer & Analyst_100%',
        email: 'ada@example.com',
      },
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(looksLikePdf(outcome.pdf)).toBe(true);
  });

  it('keeps a LaTeX injection attempt as inert text', async () => {
    const outcome = await compiler.compile(doc('{{fullName}}'), {
      fullName: '\\input{/etc/passwd}\\write18{whoami}',
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(looksLikePdf(outcome.pdf)).toBe(true);
  });

  // The reason stays coarse, but a `failure` summary rides alongside so the
  // admin editor can mark the line. Both are checked against a real pdflatex run
  // here, and the serialized outcome is asserted to carry no compiler internals.
  it('fails a broken template with a safe line pointer, not the log', async () => {
    const outcome = await compiler.compile(doc('\\thisMacroDoesNotExist'), {});

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('compile_failed');
    expect(outcome.failure?.line).toBeGreaterThan(0);
    expect(outcome.failure?.message).toContain('Unknown LaTeX command');
    // No container path, no TeX internals, nothing from the log itself.
    expect(JSON.stringify(outcome)).not.toContain('/usr/share');
    expect(JSON.stringify(outcome)).not.toContain('output.log');
    expect(JSON.stringify(outcome)).not.toContain('thisMacroDoesNotExist');
  });

  it('leaves no container behind', async () => {
    const engine = new DockerEngine();
    const before = await containerCount(engine);
    await compiler.compile(doc('plain text'), {});
    expect(await containerCount(engine)).toBe(before);
  });

  // Phase 6: the live-preview path must hold the exact same two non-negotiable
  // rules as the final build — escape everything, compile only in the sandbox —
  // so the injection suite is re-run against compilePreview verbatim.
  describe('preview path', () => {
    function looksLikePng(png: Buffer): boolean {
      return (
        png.length > 100 &&
        png
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    }

    it('rasterizes a real PDF to a PNG through the sandbox', async () => {
      const outcome = await compiler.compilePreview(
        doc('\\section*{Ada Lovelace}\n{{headline}}\nEmail: {{email}}'),
        {
          fullName: 'Ada Lovelace',
          headline: 'Engineer & Analyst_100%',
          email: 'ada@example.com',
        },
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(looksLikePng(outcome.png)).toBe(true);
    });

    it('keeps a LaTeX injection attempt inert in the preview too', async () => {
      const outcome = await compiler.compilePreview(doc('{{fullName}}'), {
        fullName: '\\input{/etc/passwd}\\write18{whoami}',
      });
      // A successful render is itself proof the value was escaped, not executed.
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(looksLikePng(outcome.png)).toBe(true);
    });

    it('fails a broken template with a safe line pointer, not the log', async () => {
      const outcome = await compiler.compilePreview(
        doc('\\thisMacroDoesNotExist'),
        {},
      );

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.reason).toBe('compile_failed');
      expect(outcome.failure?.line).toBeGreaterThan(0);
      expect(JSON.stringify(outcome)).not.toContain('/usr/share');
      expect(JSON.stringify(outcome)).not.toContain('thisMacroDoesNotExist');
    });

    it('leaves no container behind after a preview', async () => {
      const engine = new DockerEngine();
      const before = await containerCount(engine);
      await compiler.compilePreview(doc('plain text'), {});
      expect(await containerCount(engine)).toBe(before);
    });
  });
});

/** Counts leftover job containers so the test can prove they are all removed. */
async function containerCount(engine: DockerEngine): Promise<number> {
  const res = await (
    engine as unknown as {
      send: (
        method: 'GET',
        path: string,
        body: undefined,
        timeoutMs: number,
        asJson?: boolean,
      ) => Promise<{ status: number; json: Record<string, unknown> }>;
    }
  ).send('GET', '/containers/json?all=true', undefined, 5000, true);
  const list = res.json;
  if (!Array.isArray(list)) return 0;
  return list.filter(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      Array.isArray((item as { Names?: string[] }).Names) &&
      (item as { Names: string[] }).Names.some((name) =>
        name.includes('jobtracker-latex'),
      ),
  ).length;
}
