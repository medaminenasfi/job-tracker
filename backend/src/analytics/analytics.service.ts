import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

const RANGES: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DbService) {}

  async summary(userId: string) {
    const result = await this.db.query(
      `SELECT status, COUNT(*)::int AS count FROM jobs WHERE user_id = $1 GROUP BY status`,
      [userId],
    );
    const counts: Record<string, number> = {};
    for (const row of result.rows as { status: string; count: number }[]) {
      counts[row.status] = row.count;
    }
    const applied =
      (counts['APPLIED'] ?? 0) +
      (counts['ACCEPTED'] ?? 0) +
      (counts['INTERVIEW'] ?? 0) +
      (counts['OFFER'] ?? 0) +
      (counts['REJECTED'] ?? 0) +
      (counts['WITHDRAWN'] ?? 0);
    // Response: any non-silent outcome after applying.
    const responded =
      (counts['ACCEPTED'] ?? 0) +
      (counts['INTERVIEW'] ?? 0) +
      (counts['OFFER'] ?? 0) +
      (counts['REJECTED'] ?? 0);
    const interviews = (counts['INTERVIEW'] ?? 0) + (counts['OFFER'] ?? 0);
    return {
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      byStatus: counts,
      applied,
      responseRate: applied > 0 ? Math.round((responded / applied) * 100) : 0,
      interviewRate: applied > 0 ? Math.round((interviews / applied) * 100) : 0,
    };
  }

  async bySource(userId: string) {
    const result = await this.db.query(
      `SELECT COALESCE(NULLIF(source, ''), 'Unknown') AS source, COUNT(*)::int AS count
         FROM jobs WHERE user_id = $1 GROUP BY 1 ORDER BY count DESC`,
      [userId],
    );
    return result.rows as { source: string; count: number }[];
  }

  async timeline(userId: string, range: string) {
    const days = RANGES[range] ?? 30;
    const result = await this.db.query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
         FROM jobs
        WHERE user_id = $1 AND created_at >= now() - ($2 || ' days')::interval
        GROUP BY 1 ORDER BY 1`,
      [userId, String(days)],
    );
    return result.rows as { date: string; count: number }[];
  }
}
