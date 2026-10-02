import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import type { JobQuery } from './jobs.schemas';

// Column names are interpolated into the UPDATE statement, so only this fixed
// whitelist may ever reach the SQL. Timestamps and applied_at stay out: they are
// owned by the server, never by client input.
const UPDATABLE_JOB_FIELDS = new Set([
  'title',
  'company',
  'location',
  'url',
  'source',
  'description',
  'salary',
  'employment_type',
  'status',
  'notes',
]);

// Treat a missing, empty, or whitespace-only url as NULL. The unique dedup index
// is partial on `url IS NOT NULL`, so url-less manual entries must store NULL —
// otherwise two manual jobs with url = '' for the same user would collide.
function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string')
    return value == null ? null : (value as string);
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

@Injectable()
export class JobsRepository {
  constructor(private db: DbService) {}

  async create(userId: string, data: any) {
    // Idempotent on (user_id, url): re-saving the same posting returns the
    // existing row instead of creating a duplicate. Rows with a null url are
    // exempt (partial index) so multiple url-less manual entries are allowed.
    const result = await this.db.query(
      `
      INSERT INTO jobs (user_id, title, company, location, url, source, description, salary, employment_type, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (user_id, url) WHERE url IS NOT NULL
      DO UPDATE SET updated_at = now()
      RETURNING *
    `,
      [
        userId,
        data.title,
        data.company,
        data.location ?? null,
        normalizeUrl(data.url),
        data.source ?? null,
        data.description ?? null,
        data.salary ?? null,
        data.employment_type ?? null,
        data.status || 'SAVED',
        data.notes ?? null,
      ],
    );
    return result.rows[0];
  }

  async findAll(userId: string, filter: JobQuery = {}) {
    // user_id is always $1 and always present — the scoping control that keeps
    // one user from ever reading another's jobs. Optional filters append after it.
    const conditions = ['user_id = $1'];
    const values: unknown[] = [userId];
    let idx = 2;

    if (filter.status) {
      conditions.push(`status = $${idx}`);
      values.push(filter.status);
      idx++;
    }
    if (filter.source) {
      conditions.push(`source = $${idx}`);
      values.push(filter.source);
      idx++;
    }
    if (filter.search) {
      conditions.push(
        `(title ILIKE $${idx} OR company ILIKE $${idx} OR location ILIKE $${idx})`,
      );
      values.push(`%${filter.search}%`);
      idx++;
    }

    const result = await this.db.query(
      `SELECT * FROM jobs WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      values,
    );
    return result.rows;
  }

  async findOne(userId: string, jobId: string) {
    const result = await this.db.query(
      'SELECT * FROM jobs WHERE user_id = $1 AND id = $2',
      [userId, jobId],
    );
    return result.rows[0];
  }

  async update(userId: string, jobId: string, data: any) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || !UPDATABLE_JOB_FIELDS.has(key)) continue;
      fields.push(`${key} = $${idx}`);
      values.push(key === 'url' ? normalizeUrl(value) : value);
      idx++;
    }
    if (fields.length === 0) return this.findOne(userId, jobId);

    fields.push(`updated_at = $${idx}`);
    values.push(new Date());
    idx++;

    values.push(userId, jobId);
    const query = `UPDATE jobs SET ${fields.join(', ')} WHERE user_id = $${idx} AND id = $${idx + 1} RETURNING *`;
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async updateStatus(userId: string, jobId: string, status: string) {
    const applied_at = status === 'APPLIED' ? new Date() : null;
    let query =
      'UPDATE jobs SET status = $1, updated_at = $2 WHERE user_id = $3 AND id = $4 RETURNING *';
    let values: any[] = [status, new Date(), userId, jobId];

    if (applied_at) {
      query =
        'UPDATE jobs SET status = $1, updated_at = $2, applied_at = $3 WHERE user_id = $4 AND id = $5 RETURNING *';
      values = [status, new Date(), applied_at, userId, jobId];
    }

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async delete(userId: string, jobId: string) {
    const result = await this.db.query(
      'DELETE FROM jobs WHERE user_id = $1 AND id = $2',
      [userId, jobId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
