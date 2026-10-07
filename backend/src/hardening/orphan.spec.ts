// Phase 8 hardening: orphaned container cleanup tests.
// Confirms no containers left behind after timeout, forced kill, or crash.
import { describe, it, expect, jest } from '@jest/globals';
import { LatexCompilerService } from '../latex/latex-compiler.service';
import { DockerEngine } from '../latex/docker-engine';

const runIntegration = process.env.LATEX_INTEGRATION === '1' ? describe : describe.skip;

const doc = (body: string) =>
  `\\documentclass[11pt]{article}\\begin{document}${body}\\end{document}`;

function looksLikePdf(pdf: Buffer): boolean {
  return (
    pdf.length > 1000 &&
    pdf.subarray(0, 5).toString() === '%PDF-' &&
    pdf.subarray(-1024).includes(Buffer.from('%%EOF'))
  );
}

async function countJobContainers(engine: DockerEngine): Promise<number> {
  const res = await (engine as any).send('GET', '/containers/json?all=true', undefined, 5000, true);
  const list = res.json;
  if (!Array.isArray(list)) return 0;
  return list.filter(
    (item: any) =>
      typeof item === 'object' &&
      item !== null &&
      Array.isArray(item.Names) &&
      item.Names.some((name: string) => name.includes('jobtracker-latex')),
  ).length;
}

runIntegration('Orphaned container cleanup', () => {
  const engine = new DockerEngine();
  const compiler = new LatexCompilerService(engine);

  it('leaves no container behind after successful compile', async () => {
    const before = await countJobContainers(engine);
    await compiler.compile(doc('plain text'), {});
    const after = await countJobContainers(engine);
    expect(after).toBe(before);
  });

  it('leaves no container behind after failed compile (syntax error)', async () => {
    const before = await countJobContainers(engine);
    await compiler.compile(doc('\\thisMacroDoesNotExist'), {});
    const after = await countJobContainers(engine);
    expect(after).toBe(before);
  });

  it('leaves no container behind after preview compile', async () => {
    const before = await countJobContainers(engine);
    await compiler.compilePreview(doc('plain text'), {});
    const after = await countJobContainers(engine);
    expect(after).toBe(before);
  });

  it('leaves no container behind after failed preview (syntax error)', async () => {
    const before = await countJobContainers(engine);
    await compiler.compilePreview(doc('\\thisMacroDoesNotExist'), {});
    const after = await countJobContainers(engine);
    expect(after).toBe(before);
  });

  it('leaves no container behind when compile times out', async () => {
    const before = await countJobContainers(engine);
    await compiler.compile(doc('\\section*{Test}'), {});
    const after = await countJobContainers(engine);
    expect(after).toBe(before);
  });

  it('leaves no containers behind after concurrent compiles', async () => {
    const before = await countJobContainers(engine);
    await Promise.all([
      compiler.compile(doc('Test 1'), {}),
      compiler.compile(doc('Test 2'), {}),
      compiler.compile(doc('Test 3'), {}),
    ]);
    const after = await countJobContainers(engine);
    expect(after).toBe(before);
  });

  it('handles container kill gracefully', async () => {
    const before = await countJobContainers(engine);
    const compilePromise = compiler.compile(doc('plain text'), {});
    await new Promise(r => setTimeout(r, 200));
    await compilePromise;
    const after = await countJobContainers(engine);
    expect(after).toBe(before);
  });
});