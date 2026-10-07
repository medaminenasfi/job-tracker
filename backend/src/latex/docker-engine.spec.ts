import { EventEmitter } from 'events';
import { request } from 'http';
import { encodeTarFile, readTarFile } from './docker-tar';
import { DockerEngine, DockerUnavailableError } from './docker-engine';

jest.mock('http', () => ({ request: jest.fn() }));

type Reply =
  | { status: number; body?: unknown; raw?: Buffer }
  | { event: 'timeout' | 'error'; errorMessage?: string };

type CallKind =
  | 'create'
  | 'archive-put'
  | 'archive-get'
  | 'start'
  | 'wait'
  | 'remove'
  | 'other';

interface Call {
  method: string;
  url: string;
  body: Buffer | null;
}

describe('DockerEngine', () => {
  const calls: Call[] = [];

  function mockEngine(overrides: Partial<Record<CallKind, Reply>> = {}) {
    const requestMock = request as unknown as jest.Mock;
    requestMock.mockImplementation(
      (
        opts: { method: string; path: string },
        callback: (res: EventEmitter & { statusCode: number }) => void,
      ) => {
        const kind: CallKind = opts.path.includes('/containers/create')
          ? 'create'
          : opts.path.includes('/archive') && opts.method === 'PUT'
            ? 'archive-put'
            : opts.path.includes('/archive')
              ? 'archive-get'
              : opts.path.endsWith('/start')
                ? 'start'
                : opts.path.includes('/wait')
                  ? 'wait'
                  : opts.method === 'DELETE'
                    ? 'remove'
                    : 'other';
        const defaults: Record<CallKind, Reply> = {
          create: { status: 201, body: { Id: 'abc123' } },
          'archive-put': { status: 200 },
          'archive-get': {
            status: 200,
            raw: encodeTarFile('output.pdf', Buffer.from('%PDF-1.7 body')),
          },
          start: { status: 204 },
          wait: { status: 200, body: { StatusCode: 0 } },
          remove: { status: 204 },
          other: { status: 500, body: { message: 'unexpected call' } },
        };
        const reply = overrides[kind] ?? defaults[kind];
        const written: Buffer[] = [];
        const call: Call = { method: opts.method, url: opts.path, body: null };
        calls.push(call);

        const req = new EventEmitter() as EventEmitter & {
          write: jest.Mock;
          end: jest.Mock;
          destroy: jest.Mock;
        };
        req.write = jest.fn((chunk: Buffer) => written.push(chunk));
        req.end = jest.fn(() => {
          setImmediate(() => {
            if (written.length) call.body = Buffer.concat(written);
            if ('event' in reply) {
              if (reply.event === 'timeout') req.emit('timeout');
              else
                req.emit(
                  'error',
                  new Error(reply.errorMessage ?? 'socket error'),
                );
              return;
            }
            const res = new EventEmitter() as EventEmitter & {
              statusCode: number;
            };
            res.statusCode = reply.status;
            callback(res);
            const payload =
              reply.raw ?? Buffer.from(JSON.stringify(reply.body ?? {}));
            res.emit('data', payload);
            res.emit('end');
          });
        });
        // Real ClientRequest.destroy(err) surfaces as an 'error' event.
        req.destroy = jest.fn((err?: Error) => {
          setImmediate(() => req.emit('error', err ?? new Error('destroyed')));
        });
        return req;
      },
    );
  }

  const engine = () => new DockerEngine('/var/run/docker.sock');

  beforeEach(() => {
    calls.length = 0;
  });

  it('runs a locked-down job and returns its output', async () => {
    mockEngine();
    const result = await engine().runSandbox({
      image: 'jobtracker/latex-worker:latest',
      source: '\\documentclass{article}Hi {{x}}\\end{document}',
      timeoutMs: 15000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.output?.toString()).toBe('%PDF-1.7 body');

    const create = calls.find((c) => c.url.includes('/containers/create'));
    const config = JSON.parse((create?.body as Buffer).toString()) as {
      Image: string;
      Cmd: string[];
      User: string;
      SecurityOpt: string[];
      HostConfig: Record<string, unknown>;
    };
    expect(config.Image).toBe('jobtracker/latex-worker:latest');
    expect(config.Cmd).toEqual(['-jobname=output', '/job/input.tex']);
    // Never root, even if the image's own USER changed.
    expect(config.User).toBe('10001:10001');
    expect(config.HostConfig.NetworkMode).toBe('none');
    expect(config.HostConfig.CapDrop).toEqual(['ALL']);
    expect(config.SecurityOpt).toContain('no-new-privileges:true');
    expect(config.HostConfig.PidsLimit).toBe(64);
    expect(config.HostConfig.Memory).toBeGreaterThan(0);
    // No host directory is mounted into the sandbox at all.
    expect(config.HostConfig.Binds).toBeUndefined();

    // The source is uploaded as a tar, never bind-mounted from the host.
    const upload = calls.find((c) => c.method === 'PUT');
    expect(upload?.url).toContain('/archive?path=/job');
    expect(readTarFile(upload?.body as Buffer, 'input.tex')?.toString()).toBe(
      '\\documentclass{article}Hi {{x}}\\end{document}',
    );
    // The artifact is downloaded the same way.
    expect(
      calls.some((c) => c.url.includes('/archive?path=%2Fjob%2Foutput.pdf')),
    ).toBe(true);
    // The container is always cleaned up, so nothing is left running.
    expect(
      calls.some((c) => c.method === 'DELETE' && c.url.includes('force=true')),
    ).toBe(true);
    // Regression: the daemon spells this condition with a hyphen and answers
    // `not_running` with 400, which would masquerade as a compile failure.
    expect(calls.some((c) => c.url.includes('condition=not-running'))).toBe(
      true,
    );
  });

  it('runs a preview job with a custom entrypoint and reads preview.png', async () => {
    // The preview path overrides the image entrypoint (sh -c "pdflatex && pdftoppm")
    // and reads a different artifact back — but the lockdown is identical.
    mockEngine({
      'archive-get': {
        status: 200,
        raw: encodeTarFile('preview.png', Buffer.from('png-bytes')),
      },
    });
    const result = await engine().runSandbox({
      image: 'jobtracker/latex-worker:latest',
      source: '\\documentclass{article}Hi\\end{document}',
      timeoutMs: 8000,
      entrypoint: ['/bin/sh', '-c'],
      cmd: ['pdflatex ... && pdftoppm ...'],
      outputPath: '/job/preview.png',
    });

    expect(result.exitCode).toBe(0);
    expect(result.output?.toString()).toBe('png-bytes');

    const create = calls.find((c) => c.url.includes('/containers/create'));
    const config = JSON.parse((create?.body as Buffer).toString()) as {
      Entrypoint: string[];
      Cmd: string[];
      User: string;
      HostConfig: Record<string, unknown>;
    };
    // Custom entrypoint replaces the image's pdflatex entrypoint and carries cmd.
    expect(config.Entrypoint).toEqual(['/bin/sh', '-c']);
    expect(config.Cmd).toEqual(['pdflatex ... && pdftoppm ...']);
    // Same lockdown as the final build — a preview is not a looser sandbox.
    expect(config.User).toBe('10001:10001');
    expect(config.HostConfig.NetworkMode).toBe('none');
    expect(config.HostConfig.CapDrop).toEqual(['ALL']);
    // The artifact downloaded is preview.png, not output.pdf.
    expect(
      calls.some((c) => c.url.includes('/archive?path=%2Fjob%2Fpreview.png')),
    ).toBe(true);
    expect(
      calls.some((c) => c.method === 'DELETE' && c.url.includes('force=true')),
    ).toBe(true);
  });

  it('reports a timeout when the container outlives its budget', async () => {
    mockEngine({ wait: { event: 'timeout' } });
    const result = await engine().runSandbox({
      image: 'img',
      source: 'x',
      timeoutMs: 1000,
    });
    expect(result).toEqual({
      exitCode: null,
      timedOut: true,
      output: undefined,
    });
  });

  it('surfaces a non-zero exit code without downloading anything', async () => {
    mockEngine({ wait: { status: 200, body: { StatusCode: 1 } } });
    const result = await engine().runSandbox({
      image: 'img',
      source: 'x',
      timeoutMs: 1000,
    });
    expect(result).toEqual({ exitCode: 1, timedOut: false, output: undefined });
    expect(
      calls.some((c) => c.method === 'GET' && c.url.includes('archive')),
    ).toBe(false);
  });

  it('returns no output when the archive download fails', async () => {
    mockEngine({ 'archive-get': { status: 404, raw: Buffer.from('{}') } });
    const result = await engine().runSandbox({
      image: 'img',
      source: 'x',
      timeoutMs: 1000,
    });
    expect(result.output).toBeUndefined();
    expect(result.exitCode).toBe(0);
  });

  it('throws a safe error when the daemon refuses to create the sandbox', async () => {
    mockEngine({ create: { status: 500, body: { message: 'no such image' } } });
    await expect(
      engine().runSandbox({ image: 'missing', source: 'x', timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(DockerUnavailableError);
  });

  it('throws when the source cannot be uploaded', async () => {
    mockEngine({ 'archive-put': { status: 500, body: {} } });
    await expect(
      engine().runSandbox({ image: 'img', source: 'x', timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(DockerUnavailableError);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('removes the container even when the start call fails', async () => {
    mockEngine({ start: { status: 500, body: { message: 'boom' } } });
    await expect(
      engine().runSandbox({ image: 'img', source: 'x', timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(DockerUnavailableError);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('throws a generic error when the daemon is unreachable', async () => {
    mockEngine({
      create: {
        event: 'error',
        errorMessage: 'connect ENOENT /var/run/docker.sock',
      },
    });
    await expect(
      engine().runSandbox({ image: 'img', source: 'x', timeoutMs: 1000 }),
    ).rejects.toThrow(/Docker daemon unreachable/);
  });

  it('pings the daemon for availability checks', async () => {
    mockEngine({ other: { status: 200, body: {} } });
    await expect(engine().ping()).resolves.toBe(true);

    mockEngine({ other: { event: 'error' } });
    await expect(engine().ping()).resolves.toBe(false);
  });
});
