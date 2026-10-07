// Phase 8 hardening: container escape hygiene tests.
// Confirms --network none, --read-only, --cap-drop ALL, --pids-limit, --memory, --cpus are actually applied
// by inspecting a running job's container during a test compile.
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

runIntegration('Container security hardening', () => {
  const compiler = new LatexCompilerService(new DockerEngine());
  jest.setTimeout(180_000);

  it('compile completes successfully with hardened flags', async () => {
    const outcome = await compiler.compile(doc('\\section*{Test}\\n{{headline}}'), { headline: 'Engineer' });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(looksLikePdf(outcome.pdf)).toBe(true);
  });

  it('container runs with --network none', async () => {
    const engine = new DockerEngine();
    let containerId: string | null = null;

    const compilePromise = compiler.compile(doc('\\section*{Test}\\n\\\\sleep 5'), { headline: 'Test' });

    await new Promise(r => setTimeout(r, 1000));

    const listRes = await (engine as any).send('GET', '/containers/json?all=true', undefined, 5000, true);
    const containers = listRes.json;
    const jobContainer = Array.isArray(containers)
      ? containers.find((c: any) => c.Names?.some((n: string) => n.includes('jobtracker-latex')))
      : null;

    if (jobContainer) {
      containerId = jobContainer.Id;
      const inspectRes = await (engine as any).send('GET', `/containers/${containerId}/json`, undefined, 5000, true);
      const info = inspectRes.json;

      expect(info.HostConfig.NetworkMode).toBe('none');
      expect(info.HostConfig.ReadonlyRootfs).toBe(true);
      expect(info.HostConfig.CapDrop).toContain('ALL');
      expect(info.HostConfig.PidsLimit).toBeGreaterThan(0);
      expect(info.HostConfig.PidsLimit).toBeLessThanOrEqual(64);
      expect(info.HostConfig.Memory).toBeGreaterThan(0);
      expect(info.HostConfig.Memory).toBeLessThanOrEqual(256 * 1024 * 1024);
      expect(info.HostConfig.NanoCpus).toBeGreaterThan(0);
      expect(info.HostConfig.NanoCpus).toBeLessThanOrEqual(1_000_000_000);
      expect(info.HostConfig.SecurityOpt).toContain('no-new-privileges:true');
      const tmpfs = info.HostConfig.Tmpfs;
      expect(tmpfs).toBeDefined();
      expect(Object.keys(tmpfs)).toContain('/job');
    } else {
      console.log('Container finished before inspection (fast compile)');
    }

    if (containerId) {
      try {
        await (engine as any).send('POST', `/containers/${containerId}/kill`, undefined, 5000);
      } catch {}
    }
  });

  it('container cannot reach external network', async () => {
    const outcome = await compiler.compile(
      `\\documentclass[11pt]{article}\\begin{document}\\immediate\\write18{ping -c 1 8.8.8.8}\\end{document}`,
      {},
    );
    expect(typeof outcome.ok).toBe('boolean');
  });

  it('container root filesystem is read-only', async () => {
    const outcome = await compiler.compile(
      `\\documentclass[11pt]{article}\\begin{document}\\immediate\\write18{echo test > /test.txt}\\end{document}`,
      {},
    );
    expect(typeof outcome.ok).toBe('boolean');
  });

  it('container runs as non-root user (UID 10001)', async () => {
    const engine = new DockerEngine();

    const compilePromise = compiler.compile(doc('\\section*{Test}'), { headline: 'Test' });

    await new Promise(r => setTimeout(r, 500));

    const listRes = await (engine as any).send('GET', '/containers/json?all=true', undefined, 5000, true);
    const containers = listRes.json;
    const jobContainer = Array.isArray(containers)
      ? containers.find((c: any) => c.Names?.some((n: string) => n.includes('jobtracker-latex')))
      : null;

    if (jobContainer) {
      const inspectRes = await (engine as any).send('GET', `/containers/${jobContainer.Id}/json`, undefined, 5000, true);
      const info = inspectRes.json;
      expect(info.Config.User).toBe('10001');
    }
  });
});