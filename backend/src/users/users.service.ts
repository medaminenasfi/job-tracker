import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DbService } from '../db/db.service';
import {
  changePasswordSchema,
  jobStatusCreateSchema,
  jobStatusUpdateSchema,
} from './users.schemas';

@Injectable()
export class UsersService {
  constructor(private db: DbService) {}

  async listStatuses(userId: string) {
    await this.ensureDefaultStatuses(userId);
    const result = await this.db.query(
      'SELECT id, name, color, position, is_default FROM job_statuses WHERE user_id = $1 ORDER BY position, created_at',
      [userId],
    );
    return result.rows;
  }

  async createStatus(userId: string, data: unknown) {
    const parsed = jobStatusCreateSchema.safeParse(data ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid status');
    const existing = await this.db.query(
      'SELECT id FROM job_statuses WHERE user_id = $1 AND lower(name) = lower($2)',
      [userId, parsed.data.name],
    );
    if (existing.rows.length) throw new BadRequestException('A status with this name already exists');
    const position = await this.db.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM job_statuses WHERE user_id = $1',
      [userId],
    );
    const result = await this.db.query(
      'INSERT INTO job_statuses (user_id, name, color, position, is_default) VALUES ($1, $2, $3, $4, false) RETURNING id, name, color, position, is_default',
      [userId, parsed.data.name, parsed.data.color ?? 'slate', position.rows[0].position],
    );
    return result.rows[0];
  }

  async updateStatus(userId: string, id: string, data: unknown) {
    const parsed = jobStatusUpdateSchema.safeParse(data ?? {});
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      throw new BadRequestException('Invalid status update');
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    const current = await this.db.query(
      'SELECT name, is_default FROM job_statuses WHERE user_id = $1 AND id = $2',
      [userId, id],
    );
    if (!current.rows[0]) throw new BadRequestException('Status not found');
    if (parsed.data.name !== undefined && parsed.data.name !== current.rows[0].name) {
      const duplicate = await this.db.query(
        'SELECT id FROM job_statuses WHERE user_id = $1 AND lower(name) = lower($2) AND id <> $3',
        [userId, parsed.data.name, id],
      );
      if (duplicate.rows.length) throw new BadRequestException('A status with this name already exists');
      await this.db.query('UPDATE jobs SET status = $1 WHERE user_id = $2 AND status = $3', [parsed.data.name, userId, current.rows[0].name]);
    }
    if (parsed.data.name !== undefined) { fields.push(`name = $${fields.length + 1}`); values.push(parsed.data.name); }
    if (parsed.data.color !== undefined) { fields.push(`color = $${fields.length + 1}`); values.push(parsed.data.color); }
    if (parsed.data.position !== undefined) { fields.push(`position = $${fields.length + 1}`); values.push(parsed.data.position); }
    values.push(userId, id);
    const result = await this.db.query(
      `UPDATE job_statuses SET ${fields.join(', ')}, updated_at = now() WHERE user_id = $${fields.length + 1} AND id = $${fields.length + 2} RETURNING id, name, color, position, is_default`,
      values,
    );
    return result.rows[0];
  }

  async deleteStatus(userId: string, id: string) {
    const status = await this.db.query(
      'SELECT name FROM job_statuses WHERE user_id = $1 AND id = $2',
      [userId, id],
    );
    if (!status.rows[0]) throw new BadRequestException('Status not found');
    const replacement = await this.db.query(
      'SELECT name FROM job_statuses WHERE user_id = $1 AND id <> $2 ORDER BY position, created_at LIMIT 1',
      [userId, id],
    );
    if (!replacement.rows[0]) throw new BadRequestException('Keep at least one status');
    await this.db.query(
      'UPDATE jobs SET status = $1, updated_at = now() WHERE user_id = $2 AND status = $3',
      [replacement.rows[0].name, userId, status.rows[0].name],
    );
    const result = await this.db.query(
      'DELETE FROM job_statuses WHERE user_id = $1 AND id = $2 RETURNING id',
      [userId, id],
    );
    if (!result.rows[0]) throw new BadRequestException('Status not found');
    return { deleted: true };
  }

  private async ensureDefaultStatuses(userId: string) {
    const existing = await this.db.query('SELECT 1 FROM job_statuses WHERE user_id = $1 LIMIT 1', [userId]);
    if (existing.rows.length) return;
    await this.db.query(`
      INSERT INTO job_statuses (user_id, name, color, position, is_default)
      SELECT $1, defaults.name, defaults.color, defaults.position, true
      FROM (VALUES
        ('SAVED', 'sky', 0), ('APPLIED', 'blue', 1), ('ACCEPTED', 'violet', 2),
        ('INTERVIEW', 'amber', 3), ('OFFER', 'emerald', 4), ('REJECTED', 'rose', 5),
        ('WITHDRAWN', 'slate', 6)
      ) AS defaults(name, color, position)
    `, [userId]);
  }

  async updateProfile(userId: string, data: { name?: string; email?: string }) {
    const { name, email } = data;

    if (email) {
      const existing = await this.db.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, userId],
      );
      if (existing.rows.length > 0) {
        throw new BadRequestException('Email already in use');
      }
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }

    if (updates.length === 0) {
      throw new BadRequestException('No fields to update');
    }

    values.push(userId);
    const query = `
      UPDATE users 
      SET ${updates.join(', ')} 
      WHERE id = $${paramIndex} 
      RETURNING id, name, email
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  // Sets a new password. If the account already has one, the current password must
  // be supplied and verified. A Google-only account (password_hash IS NULL) may set
  // its FIRST password without a current one — that is the "add a password so you
  // can also sign in with email" path. Returns no user data.
  async changePassword(userId: string, data: unknown) {
    const parsed = changePasswordSchema.safeParse(data ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    const { currentPassword, newPassword } = parsed.data;
    const res = await this.db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );
    const row = res.rows[0];
    if (!row) throw new UnauthorizedException('Invalid credentials');

    // Only require/verify the current password when one already exists.
    if (row.password_hash) {
      if (!currentPassword) {
        throw new BadRequestException('Current password is required');
      }
      const valid = await bcrypt.compare(currentPassword, row.password_hash);
      if (!valid)
        throw new UnauthorizedException('Current password is incorrect');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await this.db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      hash,
      userId,
    ]);
    return { updated: true };
  }

  // Disconnects Google from an account. Refused unless the account still has a
  // password to sign in with — otherwise unlinking would lock the user out.
  async unlinkGoogle(userId: string) {
    const res = await this.db.query(
      'SELECT google_id, password_hash FROM users WHERE id = $1',
      [userId],
    );
    const row = res.rows[0];
    if (!row) throw new UnauthorizedException('Invalid credentials');
    if (!row.google_id) throw new BadRequestException('Google is not connected');
    if (!row.password_hash) {
      throw new BadRequestException(
        'Set a password before unlinking Google',
      );
    }
    await this.db.query(
      "UPDATE users SET google_id = NULL, auth_provider = 'local' WHERE id = $1",
      [userId],
    );
    return { unlinked: true };
  }

  // Deletes the account; jobs and refresh_tokens cascade, which also ends every
  // active session for this user.
  async deleteAccount(userId: string) {
    await this.db.query('DELETE FROM users WHERE id = $1', [userId]);
    return { deleted: true };
  }
}
