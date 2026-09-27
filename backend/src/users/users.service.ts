import { Injectable, BadRequestException } from '@nestjs/common';
import { DbService } from '../db/db.service';

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
}
