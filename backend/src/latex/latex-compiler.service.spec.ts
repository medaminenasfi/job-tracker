import { LatexCompilerService } from './latex-compiler.service';
import type { DockerEngine, RunResult, SandboxConfig } from './docker-engine';

describe('LatexCompilerService', () => {
  let docker: {
    ping: jest.Mock;
    runSandbox: jest.Mock<Promise<RunResult>, [SandboxConfig]>;
  };
  let service: LatexCompilerService;

  beforeEach(() => {
    docker = {
      ping: jest.fn().mockResolvedValue(true),
      runSandbox: jest.fn<Promise<RunResult>, [SandboxConfig]>(),
    };
    service = new LatexCompilerService(docker as unknown as DockerEngine);
  });

  const ok: RunResult = {
    exitCode: 0,
    timedOut: false,
    output: Buffer.from('%PDF-1.7 fake'),
  };

  it('compiles a document and returns the PDF', async () => {
    docker.runSandbox.mockResolvedValue(ok);
    const outcome = await service.compile('Hi {{fullName}}', {
      fullName: 'Ada',
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('escapes field values before handing the source to the sandbox', async () => {
    docker.runSandbox.mockResolvedValue(ok);
    await service.compile('Name: {{fullName}}', {
      fullName: 'A_B & \\input{/etc/passwd}',
    });
    // Literal text, never a command.
    expect(docker.runSandbox.mock.calls[0][0].source).toBe(
      'Name: A\\_B \\& \\textbackslash{}input\\{/etc/passwd\\}',
    );
  });

  it('reports a timeout without exposing compiler output', async () => {
    docker.runSandbox.mockResolvedValue({
      exitCode: null,
      timedOut: true,
    });
    const outcome = await service.compile('{{fullName}}', { fullName: 'Ada' });
    expect(outcome).toEqual({ ok: false, reason: 'timeout' });
  });

  it('reports a non-zero exit as a generic failure', async () => {
    docker.runSandbox.mockResolvedValue({ exitCode: 1, timedOut: false });
    const outcome = await service.compile('\\badmacro', {});
    expect(outcome).toEqual({ ok: false, reason: 'compile_failed' });
  });

  // The admin editor needs the line number to point at, so a failed compile
  // carries a whitelisted summary of the log instead of nothing at all.
  it('summarizes the log so the editor can point at the failing line', async () => {
    docker.runSandbox.mockResolvedValue({
      exitCode: 1,
      timedOut: false,
      diagnostics: Buffer.from('! Undefined control sequence.\nl.12 \\nope\n'),
    });
    const outcome = await service.compile('\\nope', {});
    expect(outcome).toEqual({
      ok: false,
      reason: 'compile_failed',
      failure: { line: 12, message: expect.stringContaining('Unknown') },
    });
  });

  it('asks the sandbox for the log only where it can be read back', async () => {
    docker.runSandbox.mockResolvedValue({
      exitCode: 0,
      timedOut: false,
      output: Buffer.from('%PDF-1.5'),
    });
    await service.compile('{{fullName}}', { fullName: 'Ada' });
    expect(docker.runSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ diagnosticPath: '/job/output.log' }),
    );
  });

  it('asks the preview sandbox for the log too', async () => {
    docker.runSandbox.mockResolvedValue({
      exitCode: 0,
      timedOut: false,
      output: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
    await service.compilePreview('{{fullName}}', { fullName: 'Ada' });
    expect(docker.runSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ diagnosticPath: '/job/output.log' }),
    );
  });

  it('reports a missing artifact', async () => {
    docker.runSandbox.mockResolvedValue({ exitCode: 0, timedOut: false });
    const outcome = await service.compile('{{fullName}}', {});
    expect(outcome).toEqual({ ok: false, reason: 'no_output' });
  });

  it('rejects output that is not a PDF', async () => {
    docker.runSandbox.mockResolvedValue({
      exitCode: 0,
      timedOut: false,
      output: Buffer.from('not a pdf'),
    });
    const outcome = await service.compile('{{fullName}}', {});
    expect(outcome).toEqual({ ok: false, reason: 'no_output' });
  });

  it('degrades to sandbox_unavailable when the daemon is unreachable', async () => {
    docker.runSandbox.mockRejectedValue(new Error('connect ENOENT'));
    const outcome = await service.compile('{{fullName}}', {});
    expect(outcome).toEqual({ ok: false, reason: 'sandbox_unavailable' });
  });

  it('passes the configured image and timeout to the sandbox', async () => {
    process.env.LATEX_WORKER_IMAGE = 'custom/tex:1';
    process.env.LATEX_COMPILE_TIMEOUT_MS = '2000';
    expect(service.workerImage).toBe('custom/tex:1');
    expect(service.timeoutMs).toBe(2000);

    docker.runSandbox.mockResolvedValue(ok);
    await service.compile('{{fullName}}', {});
    expect(docker.runSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ image: 'custom/tex:1', timeoutMs: 2000 }),
    );
    delete process.env.LATEX_WORKER_IMAGE;
    delete process.env.LATEX_COMPILE_TIMEOUT_MS;
  });

  it('reports availability from the daemon ping', async () => {
    await expect(service.isAvailable()).resolves.toBe(true);
    docker.ping.mockResolvedValue(false);
    await expect(service.assertAvailable()).rejects.toThrow(
      /not available on this server/,
    );
  });

  describe('compilePreview', () => {
    // A real PNG starts with the 8-byte signature; the compiler only checks the
    // first four magic bytes before accepting the artifact.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    it('rasterizes the first page and returns the PNG', async () => {
      docker.runSandbox.mockResolvedValue({
        exitCode: 0,
        timedOut: false,
        output: png,
      });
      const outcome = await service.compilePreview('Hi {{fullName}}', {
        fullName: 'Ada',
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok)
        expect(outcome.png.subarray(0, 4)).toEqual(png.subarray(0, 4));
    });

    it('escapes values exactly like the final compile (same injection defense)', async () => {
      docker.runSandbox.mockResolvedValue({
        exitCode: 0,
        timedOut: false,
        output: png,
      });
      await service.compilePreview('Name: {{fullName}}', {
        fullName: 'A_B & \\input{/etc/passwd}',
      });
      expect(docker.runSandbox.mock.calls[0][0].source).toBe(
        'Name: A\\_B \\& \\textbackslash{}input\\{/etc/passwd\\}',
      );
    });

    it('runs pdflatex+pdftoppm via a shell entrypoint and reads preview.png', async () => {
      process.env.LATEX_PREVIEW_TIMEOUT_MS = '3000';
      expect(service.previewTimeoutMs).toBe(3000);
      docker.runSandbox.mockResolvedValue({
        exitCode: 0,
        timedOut: false,
        output: png,
      });
      await service.compilePreview('{{fullName}}', {});
      const config = docker.runSandbox.mock.calls[0][0];
      expect(config.entrypoint).toEqual(['/bin/sh', '-c']);
      expect(config.cmd?.[0]).toContain('pdftoppm');
      expect(config.outputPath).toBe('/job/preview.png');
      expect(config.timeoutMs).toBe(3000);
      delete process.env.LATEX_PREVIEW_TIMEOUT_MS;
    });

    it('defaults the preview timeout to 8s', () => {
      expect(service.previewTimeoutMs).toBe(8000);
    });

    it('reports a timeout', async () => {
      docker.runSandbox.mockResolvedValue({ exitCode: null, timedOut: true });
      const outcome = await service.compilePreview('{{fullName}}', {});
      expect(outcome).toEqual({ ok: false, reason: 'timeout' });
    });

    it('reports a non-zero exit as a generic failure', async () => {
      docker.runSandbox.mockResolvedValue({ exitCode: 1, timedOut: false });
      const outcome = await service.compilePreview('\\badmacro', {});
      expect(outcome).toEqual({ ok: false, reason: 'compile_failed' });
    });

    it('carries the failing line so the editor can mark it', async () => {
      docker.runSandbox.mockResolvedValue({
        exitCode: 1,
        timedOut: false,
        diagnostics: Buffer.from(
          "/job/input.tex:7: Undefined control sequence.\nl.7 \\nope\n",
        ),
      });
      const outcome = await service.compilePreview('\\nope', {});
      expect(outcome).toEqual({
        ok: false,
        reason: 'compile_failed',
        failure: { line: 7, message: expect.stringContaining('Unknown') },
      });
    });

    it('rejects output that is not a PNG', async () => {
      docker.runSandbox.mockResolvedValue({
        exitCode: 0,
        timedOut: false,
        output: Buffer.from('%PDF-1.7 not a png'),
      });
      const outcome = await service.compilePreview('{{fullName}}', {});
      expect(outcome).toEqual({ ok: false, reason: 'no_output' });
    });

    it('reports a missing artifact', async () => {
      docker.runSandbox.mockResolvedValue({ exitCode: 0, timedOut: false });
      const outcome = await service.compilePreview('{{fullName}}', {});
      expect(outcome).toEqual({ ok: false, reason: 'no_output' });
    });

    it('degrades to sandbox_unavailable when the daemon is unreachable', async () => {
      docker.runSandbox.mockRejectedValue(new Error('connect ENOENT'));
      const outcome = await service.compilePreview('{{fullName}}', {});
      expect(outcome).toEqual({ ok: false, reason: 'sandbox_unavailable' });
    });
  });
});
