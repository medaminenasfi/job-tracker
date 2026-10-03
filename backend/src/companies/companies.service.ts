import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly db: DbService) {}

  // Group case-insensitively so "Google" and "google" land in one company.
  async list(userId: string) {
    const result = await this.db.query(
      `SELECT MIN(company) AS name, COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE status = 'APPLIED')::int AS applied,
              COUNT(*) FILTER (WHERE status = 'INTERVIEW')::int AS interview,
              COUNT(*) FILTER (WHERE status = 'OFFER')::int AS offer,
              COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected
         FROM jobs WHERE user_id = $1
        GROUP BY lower(company)
        ORDER BY count DESC`,
      [userId],
    );
    return result.rows as Record<string, unknown>[];
  }

  async jobsFor(userId: string, name: string) {
    const result = await this.db.query(
      `SELECT id, title, company, status, created_at
         FROM jobs WHERE user_id = $1 AND lower(company) = lower($2)
        ORDER BY created_at DESC`,
      [userId, name],
    );
    return result.rows as Record<string, unknown>[];
  }
}
