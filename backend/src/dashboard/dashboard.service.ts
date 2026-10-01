import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

// MVP1 announcements are a hardcoded feed (the guide allows a JSON file/constant
// here). Admins can move this to a table + admin editor later without changing
// the /dashboard/summary contract.
const ANNOUNCEMENTS = [
  {
    id: 'welcome',
    title: 'Welcome to Job Tracker',
    body: 'Save jobs from LinkedIn and Indeed in one click with the browser extension.',
    date: '2026-09-01',
  },
  {
    id: 'pipeline',
    title: 'Track your pipeline',
    body: 'Drag cards across the board to move a job from Saved to Applied, Interview and Offer.',
    date: '2026-09-15',
  },
];

export type JobStatusCount = { status: string; count: number };

@Injectable()
export class DashboardService {
  constructor(private readonly db: DbService) {}

  // Single aggregated payload for the user's dashboard home so the page loads
  // from one request instead of several.
  async getSummary(userId: string) {
    const [statusRes, activityRes, flagsRes, recentRes, sparkRes] =
      await Promise.all([
        this.db.query(
          'SELECT status, count(*)::int AS count FROM jobs WHERE user_id = $1 GROUP BY status',
          [userId],
        ),
        this.db.query(
          `SELECT
             count(*) FILTER (WHERE applied_at >= now() - interval '7 days')::int AS week,
             count(*) FILTER (WHERE applied_at >= now() - interval '30 days')::int AS month
           FROM jobs WHERE user_id = $1`,
          [userId],
        ),
        this.db.query(
          `SELECT
             EXISTS(SELECT 1 FROM jobs WHERE user_id = $1 AND source IS NOT NULL) AS extension,
             EXISTS(SELECT 1 FROM jobs WHERE user_id = $1 AND (applied_at IS NOT NULL OR status <> 'SAVED')) AS applied`,
          [userId],
        ),
        this.db.query(
          'SELECT id, title, company, status, created_at FROM jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
          [userId],
        ),
        this.db.query(
          `SELECT date_trunc('day', applied_at)::date AS day, count(*)::int AS count
           FROM jobs
           WHERE user_id = $1 AND applied_at >= (current_date - interval '6 days')
           GROUP BY 1`,
          [userId],
        ),
      ]);

    const counts = this.toCounts(statusRes.rows as JobStatusCount[]);
    const activity = activityRes.rows[0] ?? { week: 0, month: 0 };
    const flags = flagsRes.rows[0] ?? { extension: false, applied: false };

    return {
      counts,
      activity: {
        appliedThisWeek: activity.week ?? 0,
        appliedThisMonth: activity.month ?? 0,
        last7Days: this.toSparkline(sparkRes.rows as { day: string; count: number }[]),
      },
      recentJobs: recentRes.rows,
      checklist: {
        accountCreated: true,
        extensionConnected: Boolean(flags.extension),
        firstJobSaved: counts.total > 0,
        appliedJob: Boolean(flags.applied),
      },
      announcements: ANNOUNCEMENTS,
    };
  }

  // Folds GROUP BY rows into a fixed shape with every status present and a total.
  private toCounts(rows: JobStatusCount[]) {
    const base: Record<string, number> = {
      total: 0,
      saved: 0,
      applied: 0,
      accepted: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
      withdrawn: 0,
    };
    for (const row of rows) {
      const key = row.status.toLowerCase();
      if (key in base) base[key] = row.count;
      base.total += row.count;
    }
    return base;
  }

  // Builds exactly 7 day buckets (oldest -> today) so the sparkline is stable even
  // when the user applied to nothing on most days.
  private toSparkline(rows: { day: string; count: number }[]): number[] {
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const key = new Date(row.day).toISOString().slice(0, 10);
      byDay.set(key, row.count);
    }
    const buckets: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets.push(byDay.get(d.toISOString().slice(0, 10)) ?? 0);
    }
    return buckets;
  }
}
