import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { DbService } from '../db/db.service';
import type { CvStructuredData } from '../cvs/cv-schemas';
import {
  LatexCompilerService,
  type BuildFieldValues,
} from './latex-compiler.service';
import { buildCvSchema } from './latex-build.schemas';

export type BuildStatus = 'queued' | 'compiling' | 'ready' | 'failed';

// Where compiled PDFs live. Exported so the unified CV list can serve (and
// delete) a generated PDF without duplicating the path.
export function generatedCvDir(): string {
  return join(process.cwd(), 'uploads', 'generated');
}

export interface GeneratedCvRow {
  id: string;
  user_id: string;
  template_id: string;
  field_values: BuildFieldValues;
  pdf_url: string | null;
  status: BuildStatus;
  error_message: string | null;
  created_at: string;
}

// Compiling is CPU/container-expensive: bound how many run at once so a burst of
// requests cannot starve the API host.
const MAX_CONCURRENT_COMPILES = 2;

export interface BuildTemplate {
  id: string;
  name: string;
  latex_source: string;
}

// Gallery row: metadata only, no LaTeX source.
export interface CvTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  preview_image_url: string | null;
  language: string;
}

const GENERIC_ERRORS: Record<string, string> = {
  timeout: 'Compilation took too long. Try a shorter CV or a simpler template.',
  compile_failed: 'The template could not be compiled.',
  no_output: 'The template produced no PDF.',
  sandbox_unavailable: 'PDF generation is unavailable right now.',
};

@Injectable()
export class LatexBuildService implements OnModuleInit {
  private readonly logger = new Logger(LatexBuildService.name);
  private active = 0;
  private readonly pending: (() => void)[] = [];

  constructor(
    private readonly db: DbService,
    private readonly compiler: LatexCompilerService,
  ) {}

  get storageDir(): string {
    return generatedCvDir();
  }

  // Gallery for the CV builder: active templates only, without the LaTeX
  // source (admins are the only ones who may read that).
  async listActiveTemplates(): Promise<CvTemplateSummary[]> {
    const result = await this.db.query(
      `SELECT id, name, description, preview_image_url, language
         FROM cv_templates WHERE is_active = true
        ORDER BY created_at DESC`,
    );
    return result.rows as CvTemplateSummary[];
  }

  // A restart kills any in-flight compile; the row would otherwise sit in
  // 'compiling' forever. Fail it explicitly instead.
  async onModuleInit() {
    await this.db
      .query(
        `UPDATE generated_cvs
            SET status = 'failed', error_message = 'Compilation was interrupted'
          WHERE status IN ('queued', 'compiling')`,
      )
      .catch(() => undefined);
  }

  async create(userId: string, data: unknown) {
    // Fail fast with a clear message when no sandbox is wired up, instead of
    // queueing a build that can only ever end in "unavailable".
    await this.compiler.assertAvailable();
    const parsed = buildCvSchema.safeParse(data ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    const template = await this.getActiveTemplate(parsed.data.template_id);
    const result = await this.db.query(
      `INSERT INTO generated_cvs (id, user_id, template_id, field_values, status)
       VALUES ($1, $2, $3, $4, 'queued')
       RETURNING id, user_id, template_id, field_values, pdf_url, status,
                 error_message, created_at`,
      [randomUUID(), userId, template.id, JSON.stringify(parsed.data.fields)],
    );
    const row = result.rows[0] as GeneratedCvRow;

    // Fire-and-forget: the client polls the record, the request never waits on
    // a container (the roadmap's queue semantics, without adding Redis).
    void this.enqueue(row, template);
    return row;
  }

  async findOne(userId: string, id: string) {
    const result = await this.db.query(
      `SELECT id, user_id, template_id, field_values, pdf_url, status,
              error_message, created_at
       FROM generated_cvs WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    const row = result.rows[0] as GeneratedCvRow | undefined;
    if (!row) throw new NotFoundException('Generated CV not found');
    return row;
  }

  // Compiles serially through a tiny in-process semaphore.
  private async enqueue(row: GeneratedCvRow, template: BuildTemplate) {
    await new Promise<void>((resolve) => {
      const start = () => {
        this.active++;
        void this.process(row, template).finally(() => {
          this.active--;
          this.pending.shift()?.();
          resolve();
        });
      };
      if (this.active < MAX_CONCURRENT_COMPILES) start();
      else this.pending.push(start);
    });
  }

  private async process(row: GeneratedCvRow, template: BuildTemplate) {
    await this.setStatus(row.id, row.user_id, 'compiling');
    try {
      const outcome = await this.compiler.compile(
        template.latex_source,
        row.field_values,
      );
      if (!outcome.ok) {
        await this.setStatus(
          row.id,
          row.user_id,
          'failed',
          GENERIC_ERRORS[outcome.reason] ?? 'Compilation failed.',
        );
        return;
      }
      await mkdir(this.storageDir, { recursive: true });
      await writeFile(join(this.storageDir, `${row.id}.pdf`), outcome.pdf);
      await this.db.query(
        `UPDATE generated_cvs
            SET status = 'ready', pdf_url = $1, error_message = NULL
          WHERE id = $2 AND user_id = $3`,
        [`/api/cvs/build/${row.id}/file`, row.id, row.user_id],
      );
      await this.registerBuiltCv(row, template.name);
    } catch (error) {
      this.logger.warn(
        `Build ${row.id} failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      await this.setStatus(
        row.id,
        row.user_id,
        'failed',
        GENERIC_ERRORS.sandbox_unavailable,
      );
    }
  }

  // A ready build becomes a regular row in `cvs` with source = 'built', under the
  // build's own id. That is what makes /profile/cvs, the job CV picker, renaming,
  // default-flagging and downloads work unchanged for generated CVs — one list,
  // two ways to populate it.
  private async registerBuiltCv(row: GeneratedCvRow, templateName: string) {
    const label = `${templateName} — generated CV`.slice(0, 120);
    const data = this.toStructuredData(row.field_values);
    await this.db.query(
      `INSERT INTO cvs (id, user_id, label, source, file_url, structured_data,
                        parse_method, parse_status, parsed_at)
       VALUES ($1, $2, $3, 'built', $4, $5, NULL, 'parsed', now())`,
      [
        row.id,
        row.user_id,
        label,
        `/api/cvs/build/${row.id}/file`,
        JSON.stringify(data),
      ],
    );
  }

  // The field values the user just typed are already structured, so they are
  // stored in the shared CV shape (no parsing step, hence no parse_method).
  private toStructuredData(fields: BuildFieldValues): CvStructuredData {
    const entry = (value?: string) => (value ? [{ text: value }] : []);
    const clean = (value?: string) => value?.trim() || undefined;
    return {
      fullName: clean(fields.fullName),
      email: clean(fields.email),
      phone: clean(fields.phone),
      experience: entry(fields.experience?.trim()),
      education: entry(fields.education?.trim()),
      skills: (fields.skills ?? '')
        .split(',')
        .map((skill) => skill.trim())
        .filter(Boolean),
    };
  }

  private async setStatus(
    id: string,
    userId: string,
    status: BuildStatus,
    errorMessage?: string,
  ) {
    await this.db.query(
      `UPDATE generated_cvs SET status = $1, error_message = $2
       WHERE id = $3 AND user_id = $4`,
      [status, errorMessage ?? null, id, userId],
    );
  }

  // Users may only build from templates an admin has activated; the LaTeX source
  // is read here and never accepted from the client. Public so the preview path
  // resolves a template through the exact same active-only, server-read rule.
  async getActiveTemplate(templateId: string): Promise<BuildTemplate> {
    const result = await this.db.query(
      `SELECT id, name, latex_source FROM cv_templates
       WHERE id = $1 AND is_active = true`,
      [templateId],
    );
    const template = result.rows[0] as
      { id: string; name: string; latex_source: string } | undefined;
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.db.query(
      'DELETE FROM generated_cvs WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    // The generated CV in the unified list shares this id — remove it too.
    await this.db.query('DELETE FROM cvs WHERE id = $1 AND user_id = $2', [
      id,
      userId,
    ]);
    try {
      await unlink(join(this.storageDir, `${id}.pdf`));
    } catch {
      // No stored PDF (never compiled) — fine.
    }
    return { deleted: true };
  }
}
