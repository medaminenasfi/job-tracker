import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  LatexCompilerService,
  type BuildFieldValues,
  type PreviewOutcome,
} from './latex-compiler.service';
import { LatexBuildService } from './latex-build.service';
import { buildCvSchema } from './latex-build.schemas';
import type { LatexFailure } from './latex-log';
import {
  CV_TEMPLATE_SAMPLE_DATA,
  type CvTemplatePlaceholder,
} from './latex-template';

export interface PreviewResult {
  /** Rasterized first page, returned to the caller as a base64 data URL. */
  png: Buffer;
  /** True when served from the short-lived in-memory cache (no container ran). */
  cached: boolean;
}

/**
 * Thrown when a newer preview for the same scope arrived before this one started
 * compiling. It is not an error the user caused — the client already moved on —
 * so it maps to 409 and the caller simply discards the response. Crucially it is
 * raised *before* any container is created, which is what keeps the "at most one
 * in-flight preview per user" guarantee true even if the browser never aborts.
 */
export class PreviewSupersededException extends HttpException {
  constructor() {
    super('Preview superseded by a newer request', HttpStatus.CONFLICT);
  }
}

// Previews render one low-res page and are called on every typing pause, so they
// get their own, larger concurrency budget than final builds — but still bounded
// so a burst of users cannot spawn unbounded containers.
const MAX_CONCURRENT_PREVIEWS = 3;

// Identical requests (same template + same field values) within a short window
// are served from memory instead of recompiling: typing a space then deleting it,
// or two tabs on the same CV, should not each burn a container.
const MAX_CACHE_ENTRIES = 100;

const GENERIC_PREVIEW_ERRORS: Record<string, string> = {
  timeout: 'Preview took too long. Try a shorter CV or a simpler template.',
  compile_failed: 'The template could not be compiled.',
  no_output: 'The template produced no preview.',
  sandbox_unavailable: 'Live preview is unavailable right now.',
};

/**
 * Live split-view preview (MVP3 Phase 6).
 *
 * The preview is NOT a separate, lighter engine: it runs the exact same
 * escape → merge → sandbox flow as a final build (via
 * {@link LatexCompilerService.compilePreview}), so the two non-negotiable MVP3
 * rules — escape everything, compile only in the Docker sandbox — hold verbatim.
 * This service adds only the request-shaping a live editor needs:
 *
 * - a short in-memory cache keyed by a hash of the inputs,
 * - per-scope supersede so at most one preview compiles per user/admin,
 * - a global cap on concurrent preview containers.
 *
 * Nothing is persisted: previews are ephemeral and never touch `generated_cvs`
 * or permanent storage.
 */
@Injectable()
export class LatexPreviewService {
  private readonly logger = new Logger(LatexPreviewService.name);

  private readonly cache = new Map<
    string,
    { png: Buffer; expiresAt: number }
  >();
  /** Latest generation counter per scope; a request older than this is stale. */
  private readonly generations = new Map<string, number>();
  /** Serialization chain per scope so only one preview compiles at a time. */
  private readonly chains = new Map<string, Promise<void>>();

  private activePreviews = 0;
  private readonly previewQueue: (() => void)[] = [];

  constructor(
    private readonly compiler: LatexCompilerService,
    private readonly builds: LatexBuildService,
  ) {}

  private get cacheTtlMs(): number {
    const value = Number(process.env.LATEX_PREVIEW_CACHE_TTL_MS);
    return Number.isFinite(value) && value >= 0 ? value : 30_000;
  }

  /**
   * User CV Builder preview: validates the same payload the final build accepts,
   * resolves the template server-side (active-only, source never taken from the
   * client) and renders it against the user's field values.
   */
  async renderUserBuild(userId: string, data: unknown): Promise<PreviewResult> {
    await this.compiler.assertAvailable();
    const parsed = buildCvSchema.safeParse(data ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    const template = await this.builds.getActiveTemplate(
      parsed.data.template_id,
    );
    const fields = parsed.data.fields;
    const key = hash(`build:${template.id}:${stableFields(fields)}`);
    return this.render(`user:${userId}`, key, () =>
      this.compiler.compilePreview(template.latex_source, fields),
    );
  }

  /**
   * Admin template-editor preview: renders the (already validated) in-progress
   * LaTeX source against the shared sample data so an admin sees a realistic
   * document while editing, before saving or activating it.
   */
  async renderAdminPreview(
    adminId: string,
    source: string,
  ): Promise<PreviewResult> {
    await this.compiler.assertAvailable();
    const key = hash(`admin:${source}`);
    return this.render(`admin:${adminId}`, key, () =>
      this.compiler.compilePreview(source, CV_TEMPLATE_SAMPLE_DATA),
    );
  }

  /**
   * Runs one preview for a scope, applying cache + supersede + concurrency cap.
   * `compile` is only invoked when this request is still the newest for its scope
   * and nothing is cached — so a superseded request never creates a container.
   */
  private async render(
    scope: string,
    key: string,
    compile: () => Promise<PreviewOutcome>,
  ): Promise<PreviewResult> {
    // Bumping the generation first is what supersedes any older in-flight
    // request for this scope: it will fail its own check below before compiling.
    const generation = (this.generations.get(scope) ?? 0) + 1;
    this.generations.set(scope, generation);

    // Chain behind the previous request for this scope, then hold the turn until
    // this one settles. At most one preview per scope is ever compiling.
    const previous = this.chains.get(scope) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current);
    this.chains.set(scope, chained);

    await previous;
    try {
      if (this.generations.get(scope) !== generation) {
        throw new PreviewSupersededException();
      }
      const hit = this.readCache(key);
      if (hit) return { png: hit, cached: true };
      return await this.acquire(() => this.compileOrThrow(key, compile));
    } finally {
      release();
      // Drop the chain only if no newer request re-armed it, so the next request
      // for this scope starts fresh instead of waiting on a settled promise.
      if (this.chains.get(scope) === chained) this.chains.delete(scope);
    }
  }

  private async compileOrThrow(
    key: string,
    compile: () => Promise<PreviewOutcome>,
  ): Promise<PreviewResult> {
    const outcome = await compile();
    if (!outcome.ok) throw this.toHttpException(outcome.reason, outcome.failure);
    this.writeCache(key, outcome.png);
    return { png: outcome.png, cached: false };
  }

  // Coarse, user-safe messages only — pdflatex logs and host paths never leave.
  // A `compile_failed` may carry a whitelisted detail (line number + description)
  // from the log summarizer; the raw log itself is never included.
  private toHttpException(
    reason: string,
    failure?: LatexFailure,
  ): HttpException {
    if (reason === 'sandbox_unavailable') {
      return new ServiceUnavailableException(
        GENERIC_PREVIEW_ERRORS.sandbox_unavailable,
      );
    }
    if (failure) {
      return new UnprocessableEntityException({
        message: failure.message,
        error: 'Unprocessable Entity',
        // Typed so the client can point at the line instead of parsing prose.
        latexError: failure,
      });
    }
    return new UnprocessableEntityException(
      GENERIC_PREVIEW_ERRORS[reason] ?? 'Preview failed.',
    );
  }

  /** Global semaphore across all scopes: bounds total preview containers. */
  private async acquire<T>(run: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      const start = () => {
        this.activePreviews++;
        resolve();
      };
      if (this.activePreviews < MAX_CONCURRENT_PREVIEWS) start();
      else this.previewQueue.push(start);
    });
    try {
      return await run();
    } finally {
      this.activePreviews--;
      this.previewQueue.shift()?.();
    }
  }

  private readCache(key: string): Buffer | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.png;
  }

  private writeCache(key: string, png: Buffer): void {
    const ttl = this.cacheTtlMs;
    if (ttl <= 0) return; // caching disabled via env
    this.cache.delete(key); // re-insert so eviction order is by recency
    this.cache.set(key, { png, expiresAt: Date.now() + ttl });
    while (this.cache.size > MAX_CACHE_ENTRIES) {
      // A Map iterates in insertion order, and re-inserting moves a key to the
      // end, so the first key is always the least recently used entry.
      for (const oldest of this.cache.keys()) {
        this.cache.delete(oldest);
        break;
      }
    }
  }
}

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Previews are returned inline as a base64 data URL rather than a stored file:
 * the response is authed (Bearer) like every other API call, so an `<img src>`
 * pointing at a URL would not carry the token. The client renders the data URL
 * directly. Ephemeral by design — nothing is written to disk or to the DB.
 */
export function previewDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

// Deterministic serialization of the field values so two requests with the same
// content in a different key order hash identically (and thus share a cache hit).
function stableFields(fields: BuildFieldValues): string {
  return Object.keys(fields)
    .sort()
    .map((name) => `${name}=${fields[name as CvTemplatePlaceholder] ?? ''}`)
    .join('\u0000');
}
