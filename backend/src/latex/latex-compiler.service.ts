import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DockerEngine } from './docker-engine';
import {
  summarizeLatexFailure,
  type LatexFailure,
} from './latex-log';
import { mergeTemplate, type CvTemplatePlaceholder } from './latex-template';

export type CompileOutcome =
  | { ok: true; pdf: Buffer }
  | {
      ok: false;
      reason:
        'timeout' | 'compile_failed' | 'no_output' | 'sandbox_unavailable';
      /**
       * Present only for `compile_failed`: a line number and a whitelisted
       * message, so the admin editor can point at the failing line instead of
       * reporting a bare failure. Absent for the coarse reasons, which are not
       * about the template's content.
       */
      failure?: LatexFailure;
    };

/** Same shape as CompileOutcome, but the artifact is a low-res PNG page image. */
export type PreviewOutcome =
  | { ok: true; png: Buffer }
  | {
      ok: false;
      reason:
        'timeout' | 'compile_failed' | 'no_output' | 'sandbox_unavailable';
      /** See {@link CompileOutcome.failure}. */
      failure?: LatexFailure;
    };

// Fields a user may supply for a build. Values are escaped, never interpreted.
export type BuildFieldValues = Partial<Record<CvTemplatePlaceholder, string>>;

// Preview runs pdflatex then rasterizes the first page to a small PNG, in one
// sandbox job. `-singlefile` writes `preview.png` (no `-1` page suffix); 80 dpi
// is plenty for an on-screen preview and keeps the image small. `&&` means a
// pdflatex failure short-circuits, so a bad template never reaches pdftoppm.
const PREVIEW_SHELL_COMMAND =
  'pdflatex -no-shell-escape -interaction=nonstopmode -halt-on-error ' +
  '-output-directory=/job -jobname=output /job/input.tex && ' +
  'pdftoppm -png -r 80 -singlefile /job/output.pdf /job/preview';

const PREVIEW_OUTPUT_PATH = '/job/preview.png';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

// pdflatex writes its transcript next to the job when -output-directory=/job is
// given. Read back on failure so the error can carry a line number.
const PREVIEW_LOG_PATH = '/job/output.log';
const BUILD_LOG_PATH = '/job/output.log';

// Hard cap on what we will parse out of a log: a runaway document can emit a
// lot of text and none of it is worth a regex over.
const MAX_LOG_BYTES = 256 * 1024;

@Injectable()
export class LatexCompilerService {
  private readonly logger = new Logger(LatexCompilerService.name);

  constructor(private readonly docker: DockerEngine) {}

  get workerImage(): string {
    return process.env.LATEX_WORKER_IMAGE ?? 'jobtracker/latex-worker:latest';
  }

  get timeoutMs(): number {
    const value = Number(process.env.LATEX_COMPILE_TIMEOUT_MS);
    return Number.isFinite(value) && value >= 1000 ? value : 15_000;
  }

  // Previews are called far more often than final builds and render one low-res
  // page, so they get a shorter budget (default 8s).
  get previewTimeoutMs(): number {
    const value = Number(process.env.LATEX_PREVIEW_TIMEOUT_MS);
    return Number.isFinite(value) && value >= 1000 ? value : 8_000;
  }

  async isAvailable(): Promise<boolean> {
    return this.docker.ping();
  }

  /**
   * Compile one document: escape + merge the template, run it in the sandbox,
   * read the PDF back and discard the container (which is where every temporary
   * file of the job lived, so there is nothing left to wipe).
   *
   * Failure details from pdflatex are never returned — compiler logs can contain
   * internal paths — only a coarse reason the caller maps to a generic message.
   */
  async compile(
    templateSource: string,
    values: BuildFieldValues,
  ): Promise<CompileOutcome> {
    // Escaping happens here, before anything leaves the process: this is the
    // actual LaTeX-injection defense.
    const merged = mergeTemplate(templateSource, values);

    try {
      const result = await this.docker.runSandbox({
        image: this.workerImage,
        source: merged,
        timeoutMs: this.timeoutMs,
        diagnosticPath: BUILD_LOG_PATH,
      });

      if (result.timedOut) {
        this.logger.warn(`LaTeX compile exceeded ${this.timeoutMs}ms — killed`);
        return { ok: false, reason: 'timeout' };
      }
      if (result.exitCode !== 0) {
        this.logger.warn(`pdflatex exited with code ${result.exitCode}`);
        const failure = summarizeLatexFailure(result.diagnostics);
        // The reason stays coarse; the whitelisted detail rides alongside it so a
        // bad template can be located without leaking the log.
        return { ok: false, reason: 'compile_failed', ...(failure && { failure }) };
      }

      const pdf = result.output;
      if (!pdf || !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        this.logger.warn('pdflatex produced no PDF');
        return { ok: false, reason: 'no_output' };
      }
      return { ok: true, pdf };
    } catch (error) {
      // Daemon unreachable / image missing: the sandbox is infrastructure, so the
      // raw reason is logged but never leaked to the caller.
      this.logger.warn(
        `LaTeX sandbox unavailable: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return { ok: false, reason: 'sandbox_unavailable' };
    }
  }

  /**
   * Preview path (Phase 6): identical escaping and merge as `compile`, but the
   * sandbox also rasterizes the PDF to a low-res PNG and that image is read back
   * instead of the PDF. Same non-negotiable rules apply — values are escaped by
   * `mergeTemplate` and compilation only ever happens inside the sandbox.
   */
  async compilePreview(
    templateSource: string,
    values: BuildFieldValues,
  ): Promise<PreviewOutcome> {
    const merged = mergeTemplate(templateSource, values);

    try {
      const result = await this.docker.runSandbox({
        image: this.workerImage,
        source: merged,
        timeoutMs: this.previewTimeoutMs,
        entrypoint: ['/bin/sh', '-c'],
        cmd: [PREVIEW_SHELL_COMMAND],
        outputPath: PREVIEW_OUTPUT_PATH,
        diagnosticPath: PREVIEW_LOG_PATH,
      });

      if (result.timedOut) {
        this.logger.warn(
          `LaTeX preview exceeded ${this.previewTimeoutMs}ms — killed`,
        );
        return { ok: false, reason: 'timeout' };
      }
      if (result.exitCode !== 0) {
        this.logger.warn(`preview pdflatex/pdftoppm exited ${result.exitCode}`);
        const failure = summarizeLatexFailure(result.diagnostics);
        return { ok: false, reason: 'compile_failed', ...(failure && { failure }) };
      }

      const png = result.output;
      if (!png || !png.subarray(0, 4).equals(PNG_MAGIC)) {
        this.logger.warn('preview produced no PNG');
        return { ok: false, reason: 'no_output' };
      }
      return { ok: true, png };
    } catch (error) {
      this.logger.warn(
        `LaTeX preview sandbox unavailable: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return { ok: false, reason: 'sandbox_unavailable' };
    }
  }

  /** Throws a user-safe error when the sandbox is not usable at all. */
  async assertAvailable() {
    if (await this.isAvailable()) return;
    throw new ServiceUnavailableException(
      'PDF generation is not available on this server right now',
    );
  }
}
