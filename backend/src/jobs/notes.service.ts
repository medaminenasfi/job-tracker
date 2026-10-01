import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotesRepository } from './notes.repository';
import { JobsRepository } from './jobs.repository';
import { createNoteSchema, updateNoteSchema } from './notes.schemas';

@Injectable()
export class NotesService {
  constructor(
    private readonly notesRepository: NotesRepository,
    private readonly jobsRepository: JobsRepository,
  ) {}

  // Confirm the job exists AND belongs to this user before any note operation.
  // Without this a caller could enumerate/attach notes to arbitrary job ids.
  private async assertJobOwned(userId: string, jobId: string) {
    const job = await this.jobsRepository.findOne(userId, jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }
  }

  async findAll(userId: string, jobId: string) {
    await this.assertJobOwned(userId, jobId);
    return this.notesRepository.findAllForJob(userId, jobId);
  }

  async create(userId: string, jobId: string, data: unknown) {
    const parsed = createNoteSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid note',
      );
    }
    await this.assertJobOwned(userId, jobId);
    return this.notesRepository.create(userId, jobId, parsed.data.body);
  }

  async update(userId: string, jobId: string, noteId: string, data: unknown) {
    const parsed = updateNoteSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid note',
      );
    }
    const note = await this.notesRepository.findOne(userId, jobId, noteId);
    if (!note) {
      throw new NotFoundException('Note not found');
    }
    return this.notesRepository.update(userId, jobId, noteId, parsed.data.body);
  }

  async remove(userId: string, jobId: string, noteId: string) {
    const deleted = await this.notesRepository.delete(userId, jobId, noteId);
    if (!deleted) {
      throw new NotFoundException('Note not found');
    }
  }
}
