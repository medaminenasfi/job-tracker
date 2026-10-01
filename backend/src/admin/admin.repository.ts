import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DbService } from '../db/db.service';
import { hashToken } from '../auth/token-hash';
import type { AdminUsersQuery, AdminJobsQuery } from './admin.schemas';

// NOTE: this is the ONE repository allowed to run cross-user queries. Every
// method here is reachable only through the ADMIN-guarded controller. The normal
// jobs.repository.ts stays strictly user-scoped.
@Injectable()
export class AdminRepository {
  constructor(private db: DbService) {}

  async getStats() {
    const [users, newUsersThisWeek, jobs, jobsByStatus, signupsPerWeek] =
      await Promise.all([
        this.db.query('SELECT COUNT(*)::int AS count FROM users'),
        this.db.query(
          "SELECT COUNT(*)::int AS count FROM users WHERE created_at >= date_trunc('week', now())",
        ),
        this.db.query('SELECT COUNT(*)::int AS count FROM jobs'),
        this.db.query(
          'SELECT status, COUNT(*)::int AS count FROM jobs GROUP BY status',
        ),
        this.db.query(`
        SELECT date_trunc('week', created_at)::date AS week, COUNT(*)::int AS count
        FROM users
        WHERE created_at >= now() - interval '8 weeks'
        GROUP BY week
        ORDER BY week ASC
      `),
      ]);
    return {
      totalUsers: users.rows[0].count,
      newUsersThisWeek: newUsersThisWeek.rows[0].count,
      totalJobs: jobs.rows[0].count,
      jobsByStatus: jobsByStatus.rows,
      signupsPerWeek: signupsPerWeek.rows,
    };
  }

  async listUsers(q: AdminUsersQuery) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (q.search) {
      conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx})`);
      values.push(`%${q.search}%`);
      idx++;
    }
    if (q.role) {
      conditions.push(`role = $${idx}`);
      values.push(q.role);
      idx++;
    }
    if (q.status) {
      conditions.push(`account_status = $${idx}`);
      values.push(q.status);
      idx++;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM users ${where}`,
      values,
    );
    const offset = (q.page - 1) * q.limit;
    const listRes = await this.db.query(
      `SELECT u.id, u.name, u.email, u.role, u.account_status, u.created_at, u.last_login_at,
              (SELECT COUNT(*)::int FROM jobs j WHERE j.user_id = u.id) AS job_count
       FROM users u ${where}
       ORDER BY u.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, q.limit, offset],
    );
    return {
      data: listRes.rows,
      total: countRes.rows[0].count,
      page: q.page,
      limit: q.limit,
    };
  }

  async getUser(id: string) {
    const result = await this.db.query(
      `SELECT id, name, email, role, account_status, created_at, last_login_at
       FROM users WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async getUserJobCounts(id: string) {
    const result = await this.db.query(
      'SELECT status, COUNT(*)::int AS count FROM jobs WHERE user_id = $1 GROUP BY status',
      [id],
    );
    return result.rows;
  }

  async getUserJobs(id: string) {
    const result = await this.db.query(
      'SELECT id, title, company, status, source, created_at FROM jobs WHERE user_id = $1 ORDER BY created_at DESC',
      [id],
    );
    return result.rows;
  }

  async updateUserStatus(id: string, status: string) {
    const result = await this.db.query(
      'UPDATE users SET account_status = $1 WHERE id = $2 RETURNING id, role, account_status',
      [status, id],
    );
    return result.rows[0] ?? null;
  }

  async updateUserRole(id: string, role: string) {
    const result = await this.db.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, role, account_status',
      [role, id],
    );
    return result.rows[0] ?? null;
  }

  async deleteUser(id: string) {
    // jobs/refresh_tokens cascade via ON DELETE CASCADE FKs.
    await this.db.query('DELETE FROM users WHERE id = $1', [id]);
  }

  async countAdmins() {
    const result = await this.db.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE role = 'ADMIN'",
    );
    return result.rows[0].count as number;
  }

  async listJobs(q: AdminJobsQuery) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (q.user_id) {
      conditions.push(`j.user_id = $${idx}`);
      values.push(q.user_id);
      idx++;
    }
    if (q.status) {
      conditions.push(`j.status = $${idx}`);
      values.push(q.status);
      idx++;
    }
    if (q.source) {
      conditions.push(`j.source = $${idx}`);
      values.push(q.source);
      idx++;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM jobs j ${where}`,
      values,
    );
    const offset = (q.page - 1) * q.limit;
    const listRes = await this.db.query(
      `SELECT j.id, j.user_id, j.title, j.company, j.status, j.source, j.created_at, u.email AS user_email
       FROM jobs j LEFT JOIN users u ON u.id = j.user_id
       ${where}
       ORDER BY j.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, q.limit, offset],
    );
    return {
      data: listRes.rows,
      total: countRes.rows[0].count,
      page: q.page,
      limit: q.limit,
    };
  }

  async getJob(id: string) {
    const result = await this.db.query(
      `SELECT j.*, u.email AS user_email FROM jobs j LEFT JOIN users u ON u.id = j.user_id WHERE j.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async deleteJob(id: string) {
    await this.db.query('DELETE FROM jobs WHERE id = $1', [id]);
  }

  async createInvite(createdBy: string, expiresAt: Date) {
    const token = randomBytes(32).toString('hex');
    await this.db.query(
      'INSERT INTO admin_invites (token_hash, created_by, expires_at) VALUES ($1, $2, $3)',
      [hashToken(token), createdBy, expiresAt],
    );
    // The raw token is returned once and never stored in plaintext.
    return token;
  }

  async consumeInvite(token: string) {
    // Atomically claim an unused, unexpired invite so two concurrent
    // registrations cannot both redeem the same token.
    const result = await this.db.query(
      `UPDATE admin_invites SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING id`,
      [hashToken(token)],
    );
    return result.rows[0]?.id ?? null;
  }

  async writeAuditLog(
    adminId: string,
    action: string,
    targetType: string | null,
    targetId: string | null,
  ) {
    await this.db.query(
      'INSERT INTO audit_logs (admin_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)',
      [adminId, action, targetType, targetId],
    );
  }

  async listAuditLogs(page: number, limit: number) {
    const countRes = await this.db.query(
      'SELECT COUNT(*)::int AS count FROM audit_logs',
    );
    const offset = (page - 1) * limit;
    const result = await this.db.query(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.created_at, u.email AS admin_email
       FROM audit_logs a LEFT JOIN users u ON u.id = a.admin_id
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return { data: result.rows, total: countRes.rows[0].count, page, limit };
  }
}
