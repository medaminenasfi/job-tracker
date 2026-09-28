import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { JobsRepository } from './jobs.repository';
import { createJobSchema, updateJobSchema, jobStatusSchema, jobQuerySchema } from './jobs.schemas';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly jobsRepository: JobsRepository) {}

  create(userId: string, data: unknown) {
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
    return this.jobsRepository.create(userId, parsed.data);
  }

  findAll(userId: string, query: unknown = {}) {
    const parsed = jobQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid filter');
    }
    return this.jobsRepository.findAll(userId, parsed.data);
  }

  findOne(userId: string, jobId: string) {
    return this.jobsRepository.findOne(userId, jobId);
  }

  update(userId: string, jobId: string, data: unknown) {
    const parsed = updateJobSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    return this.jobsRepository.update(userId, jobId, parsed.data);
  }

  updateStatus(userId: string, jobId: string, status: unknown) {
    const parsed = jobStatusSchema.safeParse(status);
    if (!parsed.success) {
      throw new BadRequestException('Invalid status');
    }
    return this.jobsRepository.updateStatus(userId, jobId, parsed.data);
  }

  remove(userId: string, jobId: string) {
    return this.jobsRepository.delete(userId, jobId);
  }
}
