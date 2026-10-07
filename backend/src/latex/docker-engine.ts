import { request } from 'http';
import { encodeTarFile, readTarFile } from './docker-tar';

/**
 * Minimal Docker Engine API client over the unix socket.
 *
 * Why not the `docker` CLI or dockerode: the API image is node:20-alpine with
 * no CLI installed, and a dependency would be needed for four calls
 * (create / put / start / wait / remove). The Engine API is plain HTTP over a
 * unix socket, so `http.request` with `socketPath` is enough.
 *
 * Files cross the boundary as tar archives (the API equivalent of `docker cp`),
 * never as host mounts: a container that bind-mounts a host directory needs a
 * path the daemon can resolve, which a path inside another container is not.
 * Uploading and downloading also means the sandbox never sees the host
 * filesystem at all, and its scratch space disappears with the container.
 */

const API_VERSION = 'v1.43';

export interface SandboxConfig {
  image: string;
  /** Merged, already-escaped .tex source written to /job/input.tex. */
  source: string;
  /**
   * Path to read back when the job FAILED, so the caller can turn a raw exit
   * code into something actionable (pdflatex writes its transcript to
   * /job/output.log). Only ever fetched on a non-zero exit — a successful job
   * needs no diagnostics, and a failing one has no artifact to fetch.
   */
  diagnosticPath?: string;
  /** Entrypoint arguments appended to the image ENTRYPOINT (pdflatex flags). */
  args?: string[];
  /**
   * Overrides the image ENTRYPOINT entirely, with `cmd` as its arguments. Used
   * by the preview path to run `sh -c "pdflatex … && pdftoppm …"` (two steps in
   * one job) instead of the image's single pdflatex entrypoint. The container is
   * otherwise identical — same non-root user, no network, dropped caps.
   */
  entrypoint?: string[];
  /** Arguments for `entrypoint`; ignored when `entrypoint` is not set. */
  cmd?: string[];
  /** Wall-clock budget for the whole container lifecycle. */
  timeoutMs: number;
  /** Path inside the container to read back once the job finishes. */
  outputPath?: string;
  memoryBytes?: number;
  cpus?: number;
  pidsLimit?: number;
}

export interface RunResult {
  /** Exit code, or null when the container was killed before it exited. */
  exitCode: number | null;
  timedOut: boolean;
  /** Contents of `outputPath`, when the job produced one. */
  output?: Buffer;
  /**
   * Contents of `diagnosticPath`, present only for a failed job. Raw compiler
   * output: internal paths and template text, so the caller must reduce it to a
   * safe message before it reaches an HTTP response.
   */
  diagnostics?: Buffer;
}

export class DockerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DockerUnavailableError';
  }
}

export class DockerTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DockerTimeoutError';
  }
}

export class DockerEngine {
  constructor(
    private readonly socketPath: string = process.env.DOCKER_SOCKET ??
      '/var/run/docker.sock',
    private readonly host = 'localhost',
  ) {}

  /** Cheap liveness probe so the API can report "sandbox not configured". */
  async ping(timeoutMs = 2000): Promise<boolean> {
    try {
      const res = await this.send('GET', '/_ping', undefined, timeoutMs);
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Runs one container to completion with a per-job sandbox: no network, no
   * host mounts, every capability dropped, non-root, memory/CPU/pid caps and a
   * tmpfs for TeX's cache. The container is always removed, on success,
   * failure and timeout alike.
   *
   * The root filesystem is writable (the archive API cannot upload into a
   * read-only-rootfs container) but nothing outside /job and the tmpfs is
   * reachable by the non-root user, and the whole container is discarded.
   */
  async runSandbox(config: SandboxConfig): Promise<RunResult> {
    const outputPath = config.outputPath ?? '/job/output.pdf';
    // The archive API returns a tar of the file; read it back by its base name.
    const outputName = outputPath.slice(outputPath.lastIndexOf('/') + 1);
    // A custom entrypoint (preview: `sh -c "pdflatex … && pdftoppm …"`) replaces
    // the image's pdflatex entrypoint and carries its own arguments; the default
    // path keeps appending pdflatex flags to the image ENTRYPOINT.
    const useCustomEntrypoint = config.entrypoint !== undefined;
    const created = await this.send(
      'POST',
      `/containers/create?name=${encodeURIComponent(this.uniqueName())}`,
      {
        Image: config.image,
        ...(useCustomEntrypoint ? { Entrypoint: config.entrypoint } : {}),
        Cmd: useCustomEntrypoint
          ? (config.cmd ?? [])
          : ['-jobname=output', ...(config.args ?? []), '/job/input.tex'],
        User: '10001:10001',
        Tty: false,
        AttachStdin: false,
        AttachStdout: false,
        AttachStderr: false,
        // Belt to the escaping function's braces: the compiler can never shell out.
        SecurityOpt: ['no-new-privileges:true'],
        HostConfig: {
          NetworkMode: 'none',
          AutoRemove: false,
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges:true'],
          PidsLimit: config.pidsLimit ?? 64,
          Memory: config.memoryBytes ?? 256 * 1024 * 1024,
          NanoCpus: Math.round((config.cpus ?? 1) * 1e9),
          Tmpfs: { '/tmp': 'rw,size=16m,mode=1777' },
        },
      },
      config.timeoutMs,
      true,
    );
    const containerId = created.json?.Id as string | undefined;
    if (created.status !== 201 || !containerId) {
      throw new DockerUnavailableError(
        `Sandbox could not be created (daemon status ${created.status})`,
      );
    }

    try {
      const uploaded = await this.sendBinary(
        'PUT',
        `/containers/${containerId}/archive?path=/job`,
        encodeTarFile('input.tex', Buffer.from(config.source, 'utf8')),
        'application/x-tar',
        config.timeoutMs,
      );
      if (uploaded.status !== 200) {
        throw new DockerUnavailableError(
          `Sandbox input could not be uploaded (daemon status ${uploaded.status})`,
        );
      }

      const started = await this.send(
        'POST',
        `/containers/${containerId}/start`,
        undefined,
        config.timeoutMs,
      );
      if (started.status !== 204) {
        throw new DockerUnavailableError(
          `Sandbox could not start (daemon status ${started.status})`,
        );
      }

      const exitCode = await this.waitForExit(containerId, config.timeoutMs);
      if (exitCode !== 0) {
        const diagnostics = config.diagnosticPath
          ? await this.readFile(containerId, config.diagnosticPath)
          : null;
        return {
          exitCode,
          timedOut: false,
          ...(diagnostics && { diagnostics }),
        };
      }

      // Only a clean exit can have produced a usable artifact.
      const output = await this.readFile(
        containerId,
        outputPath,
        config.timeoutMs,
      );
      return { exitCode, timedOut: false, ...(output && { output }) };
    } catch (error) {
      // Timeout: reported to the caller; `finally` force-removes the container
      // so no orphaned job keeps holding CPU/memory/pids.
      if (error instanceof DockerTimeoutError)
        return { exitCode: null, timedOut: true };
      throw error;
    } finally {
      await this.remove(containerId);
    }
  }

  private uniqueName(): string {
    return `jobtracker-latex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async waitForExit(containerId: string, timeoutMs: number) {
    // NB: the Engine API condition is hyphenated (`not-running`); `not_running`
    // is answered with 400 and would look like a compiler failure.
    const res = await this.send(
      'POST',
      `/containers/${containerId}/wait?condition=not-running`,
      undefined,
      timeoutMs,
      true,
    );
    if (res.status !== 200) {
      throw new DockerUnavailableError(
        `Sandbox wait failed (daemon status ${res.status})`,
      );
    }
    const code = res.json?.StatusCode;
    return typeof code === 'number' ? code : 1;
  }

  /**
   * Reads one file out of a finished container via the archive API (the docker cp
   * equivalent). Returns null rather than throwing when the file is absent: a
   * compile that died before writing anything is a normal outcome here, not an
   * error to bubble up as a daemon failure.
   */
  private async readFile(
    containerId: string,
    path: string,
    timeoutMs = 5000,
  ): Promise<Buffer | null> {
    const archive = await this.sendBinary(
      'GET',
      `/containers/${containerId}/archive?path=${encodeURIComponent(path)}`,
      undefined,
      undefined,
      timeoutMs,
    );
    if (archive.status !== 200) return null;
    return readTarFile(archive.raw, path.slice(path.lastIndexOf('/') + 1));
  }

  private async remove(containerId: string) {
    try {
      await this.send(
        'DELETE',
        `/containers/${containerId}?force=true&v=1`,
        undefined,
        5000,
      );
    } catch {
      // Already gone or daemon unreachable — nothing to clean up.
    }
  }

  private send(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body: unknown,
    timeoutMs: number,
    /** Parse the JSON body (create/wait replies); other replies are ignored. */
    asJson = false,
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const payload = body === undefined ? null : JSON.stringify(body);
    return this.dispatch(
      method,
      path,
      payload === null ? null : Buffer.from(payload, 'utf8'),
      payload === null ? undefined : 'application/json',
      timeoutMs,
    ).then(({ status, raw }) => ({
      status,
      json: asJson ? safeParse(raw) : {},
    }));
  }

  private sendBinary(
    method: 'GET' | 'PUT',
    path: string,
    body: Buffer | undefined,
    contentType: string | undefined,
    timeoutMs: number,
  ): Promise<{ status: number; raw: Buffer }> {
    return this.dispatch(method, path, body ?? null, contentType, timeoutMs);
  }

  private dispatch(
    method: 'GET' | 'POST' | 'DELETE' | 'PUT',
    path: string,
    body: Buffer | null,
    contentType: string | undefined,
    timeoutMs: number,
  ): Promise<{ status: number; raw: Buffer }> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          socketPath: this.socketPath,
          host: this.host,
          path: `/${API_VERSION}${path}`,
          method,
          headers: body
            ? {
                'Content-Type': contentType ?? 'application/octet-stream',
                'Content-Length': body.length,
              }
            : undefined,
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              raw: Buffer.concat(chunks),
            }),
          );
          res.on('error', reject);
        },
      );
      req.on('timeout', () => {
        req.destroy(new DockerTimeoutError('Docker Engine request timed out'));
      });
      req.on('error', (err) =>
        reject(
          // A timeout must stay distinguishable from "daemon down": the caller
          // reports the two differently (budget exceeded vs unavailable).
          err instanceof DockerTimeoutError ||
            err instanceof DockerUnavailableError
            ? err
            : new DockerUnavailableError(
                `Docker daemon unreachable at ${this.socketPath}`,
              ),
        ),
      );
      if (body) req.write(body);
      req.end();
    });
  }
}

function safeParse(raw: Buffer): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw.toString('utf8'));
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
