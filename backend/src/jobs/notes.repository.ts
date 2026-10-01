import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class NotesRepository {
  constructor(private db: DbService) {}

  // Every query is scoped by both user_id and job_id — the two columns that
  // together prove the caller owns the note and the job it hangs off. Values are
  // always parameterized; nothing from client input is interpolated into SQL.
  async findAllForJob(userId: string, jobId: string) {
    const result = await this.db.query(
      `SELECT * FROM job_notes WHERE user_id = $1 AND job_id = $2 ORDER BY created_at DESC`,
      [userId, jobId],
    );
    return result.rows;
  }

  async create(userId: string, jobId: string, body: string) {
    const result = await this.db.query(
      `INSERT INTO job_notes (user_id, job_id, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, jobId, body],
    );
    return result.rows[0];
  }

  async findOne(userId: string, jobId: string, noteId: string) {
    const result = await this.db.query(
      `SELECT * FROM job_notes WHERE user_id = $1 AND job_id = $2 AND id = $3`,
      [userId, jobId, noteId],
    );
    return result.rows[0];
  }

  async update(userId: string, jobId: string, noteId: string, body: string) {
    const result = await this.db.query(
      `UPDATE job_notes
         SET body = $1, updated_at = now()
       WHERE user_id = $2 AND job_id = $3 AND id = $4
       RETURNING *`,
      [body, userId, jobId, noteId],
    );
    return result.rows[0];
  }

  async delete(userId: string, jobId: string, noteId: string) {
    const result = await this.db.query(
      `DELETE FROM job_notes WHERE user_id = $1 AND job_id = $2 AND id = $3`,
      [userId, jobId, noteId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
