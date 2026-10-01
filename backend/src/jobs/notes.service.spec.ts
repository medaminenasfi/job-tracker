import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotesService } from './notes.service';
import { NotesRepository } from './notes.repository';
import { JobsRepository } from './jobs.repository';

describe('NotesService', () => {
  let notes: jest.Mocked<
    Pick<
      NotesRepository,
      'findAllForJob' | 'create' | 'findOne' | 'update' | 'delete'
    >
  >;
  let jobs: jest.Mocked<Pick<JobsRepository, 'findOne'>>;
  let service: NotesService;

  beforeEach(() => {
    notes = {
      findAllForJob: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'note-1' }),
      findOne: jest.fn().mockResolvedValue({ id: 'note-1' }),
      update: jest.fn().mockResolvedValue({ id: 'note-1' }),
      delete: jest.fn().mockResolvedValue(true),
    };
    jobs = {
      findOne: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    service = new NotesService(
      notes as unknown as NotesRepository,
      jobs as unknown as JobsRepository,
    );
  });

  it('verifies the job belongs to the user before listing notes', async () => {
    await service.findAll('user-A', 'job-1');
    expect(jobs.findOne).toHaveBeenCalledWith('user-A', 'job-1');
    expect(notes.findAllForJob).toHaveBeenCalledWith('user-A', 'job-1');
  });

  it('rejects note operations on a job the user does not own', async () => {
    jobs.findOne.mockResolvedValue(undefined as any);
    await expect(service.findAll('user-A', 'job-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(notes.findAllForJob).not.toHaveBeenCalled();
  });

  it('validates then forwards parsed data on create', async () => {
    await service.create('user-A', 'job-1', { body: '  follow up  ' });
    expect(jobs.findOne).toHaveBeenCalledWith('user-A', 'job-1');
    expect(notes.create).toHaveBeenCalledWith('user-A', 'job-1', 'follow up');
  });

  it('rejects an empty or whitespace note on create', async () => {
    await expect(
      service.create('user-A', 'job-1', { body: '   ' }),
    ).rejects.toThrow(BadRequestException);
    expect(notes.create).not.toHaveBeenCalled();
  });

  it('updates an existing note scoped to user, job and note id', async () => {
    await service.update('user-A', 'job-1', 'note-1', { body: 'edited' });
    expect(notes.findOne).toHaveBeenCalledWith('user-A', 'job-1', 'note-1');
    expect(notes.update).toHaveBeenCalledWith(
      'user-A',
      'job-1',
      'note-1',
      'edited',
    );
  });

  it('rejects an update to a note that does not exist', async () => {
    notes.findOne.mockResolvedValue(undefined as any);
    await expect(
      service.update('user-A', 'job-1', 'note-x', { body: 'edited' }),
    ).rejects.toThrow(NotFoundException);
    expect(notes.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid update payload', async () => {
    await expect(
      service.update('user-A', 'job-1', 'note-1', { body: '' }),
    ).rejects.toThrow(BadRequestException);
    expect(notes.update).not.toHaveBeenCalled();
  });

  it('deletes an existing note', async () => {
    await service.remove('user-A', 'job-1', 'note-1');
    expect(notes.delete).toHaveBeenCalledWith('user-A', 'job-1', 'note-1');
  });

  it('throws not found when deleting a note that does not exist', async () => {
    notes.delete.mockResolvedValue(false);
    await expect(service.remove('user-A', 'job-1', 'note-x')).rejects.toThrow(
      NotFoundException,
    );
  });
});
