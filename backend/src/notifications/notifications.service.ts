import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DbService } from '../db/db.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly db: DbService) {}

  async list(userId: string) {
    const result = await this.db.query(
      `SELECT id, job_id AS "jobId", type, body, read, created_at AS "createdAt"
         FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId],
    );
    return result.rows as {
      id: string;
      jobId: string | null;
      type: string;
      body: string;
      read: boolean;
      createdAt: string;
    }[];
  }

  async markRead(userId: string, id: string) {
    const result = await this.db.query(
      `UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId],
    );
    if (!result.rows[0]) throw new NotFoundException('Notification not found');
    return { id, read: true };
  }

  async markAllRead(userId: string) {
    await this.db.query(
      `UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
      [userId],
    );
    return { read: true };
  }

  // Daily sweep: one reminder per APPLIED job whose follow-up came due.
  @Cron('0 9 * * *')
  async sweepFollowUps() {
    const due = await this.db.query(
      `SELECT id, user_id, title, company FROM jobs
        WHERE status = 'APPLIED' AND follow_up_sent = false AND follow_up_at <= now()`,
    );
    for (const job of due.rows as {
      id: string;
      user_id: string;
      title: string;
      company: string;
    }[]) {
      await this.db.query(
        `INSERT INTO notifications (user_id, job_id, type, body)
         VALUES ($1, $2, 'follow_up', $3)`,
        [
          job.user_id,
          job.id,
          `Time to follow up on ${job.title} at ${job.company}.`,
        ],
      );
      await this.db.query(
        `UPDATE jobs SET follow_up_sent = true WHERE id = $1`,
        [job.id],
      );
    }
    if (due.rows.length > 0) {
      this.logger.log(`Created ${due.rows.length} follow-up reminder(s)`);
    }
  }
}
