import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class JobsRepository {
  constructor(private db: DbService) {}

  async create(userId: string, data: any) {
    const result = await this.db.query(`
      INSERT INTO jobs (user_id, title, company, location, url, source, description, salary, employment_type, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      userId, data.title, data.company, data.location, data.url, data.source, data.description, data.salary, data.employment_type, data.status || 'SAVED', data.notes
    ]);
    return result.rows[0];
  }

  async findAll(userId: string) {
    const result = await this.db.query('SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return result.rows;
  }

  async findOne(userId: string, jobId: string) {
    const result = await this.db.query('SELECT * FROM jobs WHERE user_id = $1 AND id = $2', [userId, jobId]);
    return result.rows[0];
  }

  async update(userId: string, jobId: string, data: any) {
    const fields = [];
    const values = [];
    let idx = 1;
    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'user_id' && value !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(value);
        idx++;
      }
    }
    if (fields.length === 0) return this.findOne(userId, jobId);
    
    fields.push(`updated_at = $${idx}`);
    values.push(new Date());
    idx++;

    values.push(userId, jobId);
    const query = `UPDATE jobs SET ${fields.join(', ')} WHERE user_id = $${idx-2} AND id = $${idx-1} RETURNING *`;
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async updateStatus(userId: string, jobId: string, status: string) {
    const applied_at = status === 'APPLIED' ? new Date() : null;
    let query = 'UPDATE jobs SET status = $1, updated_at = $2 WHERE user_id = $3 AND id = $4 RETURNING *';
    let values: any[] = [status, new Date(), userId, jobId];
    
    if (applied_at) {
      query = 'UPDATE jobs SET status = $1, updated_at = $2, applied_at = $3 WHERE user_id = $4 AND id = $5 RETURNING *';
      values = [status, new Date(), applied_at, userId, jobId];
    }
    
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async delete(userId: string, jobId: string) {
    await this.db.query('DELETE FROM jobs WHERE user_id = $1 AND id = $2', [userId, jobId]);
  }
}
