import { Injectable } from '@nestjs/common';
import { JobsRepository } from './jobs.repository';

@Injectable()
export class JobsService {
  constructor(private readonly jobsRepository: JobsRepository) {}

  create(userId: string, data: any) {
    return this.jobsRepository.create(userId, data);
  }

  findAll(userId: string) {
    return this.jobsRepository.findAll(userId);
  }

  findOne(userId: string, jobId: string) {
    return this.jobsRepository.findOne(userId, jobId);
  }

  update(userId: string, jobId: string, data: any) {
    return this.jobsRepository.update(userId, jobId, data);
  }

  updateStatus(userId: string, jobId: string, status: any) {
    return this.jobsRepository.updateStatus(userId, jobId, status);
  }

  remove(userId: string, jobId: string) {
    return this.jobsRepository.delete(userId, jobId);
  }
}
