import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { DbService } from '../db/db.service';
import { AiService } from '../ai/ai.service';
import { CvAiParserService } from './cv-ai-parser';
import { CvRuleParserService } from './cv-rule-parser';
import { cvLabelSchema, updateCvSchema } from './cvs.schemas';
import { CvStructuredData } from './cv-schemas';

const parseMethodSchema = z.enum(['rule', 'ai']);

// Magic bytes identify the real format — the client-supplied MIME type
// and extension are never trusted (AGENTS.md: validate untrusted input).
const PDF_MAGIC = Buffer.from('%PDF-');
const DOCX_MAGIC = Buffer.from('PK\x03\x04');

export type CvKind = 'pdf' | 'docx';

// Row shapes returned by the queries. The list query swaps
// parsed_text for its length so the UI never transfers the full
// text on every render.
export interface CvRow {
  id: string;
  user_id: string;
  label: string;
  source: string;
  file_url: string | null;
  parsed_text?: string | null;
  structured_data?: CvStructuredData | null;
  parse_method?: 'rule_based' | 'ai' | null;
  parse_status?: 'pending' | 'parsed' | 'partial' | 'failed' | null;
  parsed_at?: string | null;
  is_default: boolean;
  created_at: string;
}

export interface CvListRow {
  id: string;
  label: string;
  source: string;
  file_url: string | null;
  is_default: boolean;
  created_at: string;
  text_length: number | null;
  structured_data?: CvStructuredData | null;
  parse_method?: 'rule_based' | 'ai' | null;
  parse_status?: 'pending' | 'parsed' | 'partial' | 'failed' | null;
  parsed_at?: string | null;
}

// Shared by the controller (multer hard limit) and the service
// (defense-in-depth re-check) so both always agree.
export function cvMaxBytes(): number {
  const mb = Number(process.env.CV_MAX_SIZE_MB ?? '5');
  return (Number.isFinite(mb) && mb > 0 ? mb : 5) * 1024 * 1024;
}

export function cvMaxLabel(): string {
  const mb = Number(process.env.CV_MAX_SIZE_MB ?? '5');
  return `${Number.isFinite(mb) && mb > 0 ? mb : 5}`;
}

@Injectable()
export class CvsService {
  constructor(
    private readonly db: DbService,
    private readonly ruleParser: CvRuleParserService,
    private readonly aiParser: CvAiParserService,
    private readonly ai: AiService,
  ) {}

  get uploadsDir(): string {
    return join(process.cwd(), 'uploads', 'cvs');
  }

  // Real-format detection from magic bytes. Returns null when the buffer
  // is neither a PDF nor a ZIP-based DOCX.
  detectKind(buffer: Buffer): CvKind | null {
    if (buffer.subarray(0, 5).equals(PDF_MAGIC)) return 'pdf';
    if (buffer.subarray(0, 4).equals(DOCX_MAGIC)) return 'docx';
    return null;
  }

  async extractText(kind: CvKind, buffer: Buffer): Promise<string> {
    if (kind === 'pdf') {
      const result = await pdfParse(buffer);
      return (result.text ?? '').trim();
    }
    const result = await mammoth.extractRawText({ buffer });
    return (result.value ?? '').trim();
  }

  async upload(userId: string, file: Express.Multer.File, label: unknown) {
    const parsedLabel = cvLabelSchema.safeParse(label);
    if (!parsedLabel.success) {
      throw new BadRequestException(
        parsedLabel.error.issues[0]?.message ?? 'Invalid label',
      );
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('A CV file is required');
    }
    if (file.size > cvMaxBytes()) {
      throw new BadRequestException(`File exceeds the ${cvMaxLabel()}MB limit`);
    }
    const kind = this.detectKind(file.buffer);
    if (!kind) {
      throw new BadRequestException('Only PDF or DOCX files are supported');
    }

    let parsedText: string;
    try {
      parsedText = await this.extractText(kind, file.buffer);
    } catch {
      // Corrupted or password-protected files fail extraction — surface a
      // generic message rather than parser internals.
      throw new BadRequestException(
        'Could not read the file — it may be corrupted or password-protected',
      );
    }

    const id = randomUUID();
    await mkdir(this.uploadsDir, { recursive: true });
    await writeFile(join(this.uploadsDir, `${id}.${kind}`), file.buffer);

    // Rule-based parsing runs synchronously on upload — free, no AI call.
    const ruleResult = this.ruleParser.parse(parsedText);

    const result = await this.db.query(
      `INSERT INTO cvs (id, user_id, label, source, file_url, parsed_text,
                        structured_data, parse_method, parse_status, parsed_at)
       VALUES ($1, $2, $3, 'uploaded', $4, $5, $6, 'rule_based', $7, now())
       RETURNING id, user_id, label, source, file_url, is_default, created_at,
                 structured_data, parse_method, parse_status, parsed_at`,
      [
        id,
        userId,
        parsedLabel.data,
        `/api/cvs/${id}/file`,
        parsedText,
        JSON.stringify(ruleResult.data),
        ruleResult.status,
      ],
    );
    return result.rows[0] as CvRow;
  }

  // List omits parsed_text (potentially large); text_length lets the UI
  // show how much was extracted without paying the transfer cost.
  async findAll(userId: string) {
    const result = await this.db.query(
      `SELECT id, label, source, file_url, is_default, created_at,
              length(parsed_text) AS text_length,
              structured_data, parse_method, parse_status, parsed_at
       FROM cvs WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [userId],
    );
    return result.rows as CvListRow[];
  }

  // Explicit re-parse. 'ai' costs money and counts against the monthly cap,
  // so it is never triggered silently — only via this endpoint.
  async parseCv(userId: string, cvId: string, method: unknown) {
    const parsed = parseMethodSchema.safeParse(method);
    if (!parsed.success) {
      throw new BadRequestException('method must be "rule" or "ai"');
    }
    const cv = await this.findOne(userId, cvId);

    if (parsed.data === 'ai') {
      if (!cv.parsed_text) {
        throw new BadRequestException('No extracted text to parse');
      }
      await this.ai.enforceMonthlyCap(userId);
      const data = await this.aiParser.parse(cv.parsed_text);
      await this.ai.recordCall(userId);
      return this.storeParse(cvId, userId, data, 'ai', 'parsed');
    }

    const ruleResult = this.ruleParser.parse(cv.parsed_text ?? '');
    return this.storeParse(
      cvId,
      userId,
      ruleResult.data,
      'rule_based',
      ruleResult.status,
    );
  }

  private async storeParse(
    cvId: string,
    userId: string,
    data: CvStructuredData,
    method: 'rule_based' | 'ai',
    status: 'parsed' | 'partial' | 'failed',
  ) {
    const result = await this.db.query(
      `UPDATE cvs SET structured_data = $1, parse_method = $2,
                      parse_status = $3, parsed_at = now()
       WHERE id = $4 AND user_id = $5
       RETURNING id, user_id, label, source, file_url, is_default, created_at,
                 structured_data, parse_method, parse_status, parsed_at`,
      [JSON.stringify(data), method, status, cvId, userId],
    );
    return result.rows[0] as CvRow;
  }

  async update(userId: string, cvId: string, data: unknown) {
    const parsed = updateCvSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    await this.findOne(userId, cvId);

    if (parsed.data.is_default) {
      // Only one default per user — clear the others first.
      await this.db.query(
        'UPDATE cvs SET is_default = false WHERE user_id = $1',
        [userId],
      );
    }
    await this.db.query(
      `UPDATE cvs SET label = COALESCE($1, label),
                      is_default = COALESCE($2, is_default)
       WHERE id = $3 AND user_id = $4`,
      [parsed.data.label ?? null, parsed.data.is_default ?? null, cvId, userId],
    );
    return this.findOne(userId, cvId);
  }

  async remove(userId: string, cvId: string) {
    await this.findOne(userId, cvId);
    const result = await this.db.query(
      'DELETE FROM cvs WHERE id = $1 AND user_id = $2',
      [cvId, userId],
    );
    if (result.rowCount === 0) throw new NotFoundException('CV not found');
    // Best effort: the row is already gone, so a missing file must not
    // fail the request. The storage name is <id>.<kind>; try both.
    for (const ext of ['pdf', 'docx']) {
      try {
        await unlink(join(this.uploadsDir, `${cvId}.${ext}`));
      } catch {
        // already gone — fine
      }
    }
  }

  // Ownership-checked lookup shared by every route.
  async findOne(userId: string, cvId: string) {
    const result = await this.db.query(
      `SELECT id, user_id, label, source, file_url, parsed_text, is_default, created_at
       FROM cvs WHERE id = $1 AND user_id = $2`,
      [cvId, userId],
    );
    const cv = result.rows[0] as CvRow | undefined;
    if (!cv) throw new NotFoundException('CV not found');
    return cv;
  }
}
