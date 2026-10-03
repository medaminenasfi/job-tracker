import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JobsRepository } from './jobs.repository';
import { DbService } from '../db/db.service';
import { AiService } from '../ai/ai.service';
import { JobMatchService } from '../ai/job-match.service';
import {
  createJobSchema,
  updateJobSchema,
  jobStatusSchema,
  jobQuerySchema,
} from './jobs.schemas';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly jobsRepository: JobsRepository,
    @Optional() private readonly db?: DbService,
    @Optional() private readonly ai?: AiService,
    @Optional() private readonly jobMatch?: JobMatchService,
  ) {}

  async create(userId: string, data: unknown) {
    const parsed = createJobSchema.safeParse(data);
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? 'Invalid input';
      // A missing title/company is the signature of a failed page extraction —
      // log source + url so we know which sites need parser support next.
      const raw = (data ?? {}) as { source?: string; url?: string };
      this.logger.warn(
        `Rejected job create for user ${userId}: ${reason} (source=${raw.source ?? 'unknown'}, url=${raw.url ?? 'none'})`,
      );
      throw new BadRequestException(reason);
    }
    await this.assertStatus(userId, parsed.data.status);
    await this.assertCvOwnership(userId, parsed.data.cv_id);
    return this.jobsRepository.create(userId, parsed.data);
  }

  findAll(userId: string, query: unknown = {}) {
    const parsed = jobQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid filter',
      );
    }
    return this.jobsRepository.findAll(userId, parsed.data);
  }

  async findOne(userId: string, jobId: string) {
    const job = await this.jobsRepository.findOne(userId, jobId);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async update(userId: string, jobId: string, data: unknown) {
    const parsed = updateJobSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    await this.assertStatus(userId, parsed.data.status);
    await this.assertCvOwnership(userId, parsed.data.cv_id);
    const job = await this.jobsRepository.update(userId, jobId, parsed.data);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async updateStatus(userId: string, jobId: string, status: unknown) {
    const parsed = jobStatusSchema.safeParse(status);
    if (!parsed.success) {
      throw new BadRequestException('Invalid status');
    }
    await this.assertStatus(userId, parsed.data);
    const job = await this.jobsRepository.updateStatus(
      userId,
      jobId,
      parsed.data,
    );
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async remove(userId: string, jobId: string) {
    const deleted = await this.jobsRepository.delete(userId, jobId);
    if (!deleted) throw new NotFoundException('Job not found');
  }

  async setFollowUp(userId: string, jobId: string, followUpAt: unknown) {
    if (!this.db) throw new ServiceUnavailableException('DB unavailable');
    if (followUpAt !== null && typeof followUpAt !== 'string') {
      throw new BadRequestException('followUpAt must be an ISO date or null');
    }
    if (typeof followUpAt === 'string' && Number.isNaN(Date.parse(followUpAt))) {
      throw new BadRequestException('Invalid followUpAt date');
    }
    const result = await this.db.query(
      `UPDATE jobs SET follow_up_at = $1, follow_up_sent = false, updated_at = now()
        WHERE id = $2 AND user_id = $3 RETURNING id, follow_up_at, follow_up_sent`,
      [followUpAt, jobId, userId],
    );
    if (!result.rows[0]) throw new NotFoundException('Job not found');
    return result.rows[0];
  }

  async computeMatch(userId: string, jobId: string) {
    if (!this.db || !this.ai || !this.jobMatch) {
      throw new ServiceUnavailableException('AI matching is not configured');
    }
    const jobRes = await this.db.query(
      `SELECT id, title, company, description, updated_at, match_score, match_skills_matched,
              match_skills_missing, match_computed_at
         FROM jobs WHERE id = $1 AND user_id = $2`,
      [jobId, userId],
    );
    const job = jobRes.rows[0] as
      | {
          id: string;
          title: string;
          company: string;
          description: string | null;
          updated_at: string;
          match_score: number | null;
          match_skills_matched: string[] | null;
          match_skills_missing: string[] | null;
          match_computed_at: string | null;
        }
      | undefined;
    if (!job) throw new NotFoundException('Job not found');

    const profileRes = await this.db.query(
      `SELECT headline, years_experience, skills, updated_at
         FROM user_profiles WHERE user_id = $1`,
      [userId],
    );
    const profile = profileRes.rows[0] as
      | {
          headline: string | null;
          years_experience: number | null;
          skills: string[] | null;
          updated_at: string | null;
        }
      | undefined;
    if (!profile || !profile.skills || profile.skills.length === 0) {
      throw new BadRequestException(
        'Fill in your profile skills before running AI match',
      );
    }

    // Cache: nothing relevant changed since the last successful computation.
    const computedAt = job.match_computed_at
      ? new Date(job.match_computed_at).getTime()
      : 0;
    const stale =
      !computedAt ||
      new Date(job.updated_at).getTime() > computedAt ||
      (profile.updated_at
        ? new Date(profile.updated_at).getTime() > computedAt
        : false);
    if (!stale && job.match_score != null) {
      return {
        score: job.match_score,
        matchedSkills: job.match_skills_matched ?? [],
        missingSkills: job.match_skills_missing ?? [],
        cached: true,
      };
    }

    await this.ai.enforceMonthlyCap(userId);
    const result = await this.jobMatch.computeMatch(
      { title: job.title, company: job.company, description: job.description },
      {
        headline: profile.headline,
        yearsExperience: profile.years_experience,
        skills: profile.skills,
      },
    );
    await this.db.query(
      `UPDATE jobs SET match_score = $1, match_skills_matched = $2, match_skills_missing = $3,
         match_computed_at = now() WHERE id = $4 AND user_id = $5`,
      [result.score, result.matchedSkills, result.missingSkills, jobId, userId],
    );
    await this.ai.recordCall(userId);
    return { ...result, cached: false };
  }

  private async assertStatus(userId: string, status?: string) {
    if (!status || !this.db) return;
    const result = await this.db.query(
      'SELECT 1 FROM job_statuses WHERE user_id = $1 AND name = $2',
      [userId, status],
    );
    if (!result.rows[0])
      throw new BadRequestException('Status is not configured for this user');
  }

  // A job may only reference the user's own CVs — cv_id is client-supplied,
  // so verify ownership before it reaches the repository.
  private async assertCvOwnership(userId: string, cvId?: string | null) {
    if (!cvId) return;
    if (!this.db) throw new ServiceUnavailableException('DB unavailable');
    const result = await this.db.query(
      'SELECT 1 FROM cvs WHERE id = $1 AND user_id = $2',
      [cvId, userId],
    );
    if (!result.rows[0]) throw new BadRequestException('CV not found');
  }
}
