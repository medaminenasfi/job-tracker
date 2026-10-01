import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DbService } from '../db/db.service';
import { changePasswordSchema } from './users.schemas';

@Injectable()
export class UsersService {
  constructor(private db: DbService) {}

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
