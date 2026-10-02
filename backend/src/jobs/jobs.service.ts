import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { JobsRepository } from './jobs.repository';
import { DbService } from '../db/db.service';
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

  private async assertStatus(userId: string, status?: string) {
    if (!status || !this.db) return;
    const result = await this.db.query(
      'SELECT 1 FROM job_statuses WHERE user_id = $1 AND name = $2',
      [userId, status],
    );
    if (!result.rows[0])
      throw new BadRequestException('Status is not configured for this user');
  }
}
