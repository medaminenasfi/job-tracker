import { BadRequestException, Logger } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsRepository } from './jobs.repository';

describe('JobsService', () => {
  let repo: jest.Mocked<
    Pick<
      JobsRepository,
      'create' | 'findAll' | 'findOne' | 'update' | 'updateStatus' | 'delete'
    >
  >;
  let service: JobsService;

  beforeEach(() => {
    repo = {
      create: jest.fn().mockResolvedValue({ id: 'job-1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'job-1' }),
      update: jest.fn().mockResolvedValue({ id: 'job-1' }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'job-1' }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new JobsService(repo as unknown as JobsRepository);
  });

  it('scopes every read/write to the authenticated user id', async () => {
    await service.findAll('user-A');
    await service.findOne('user-A', 'job-1');
    await service.update('user-A', 'job-1', { notes: 'x' });
    await service.updateStatus('user-A', 'job-1', 'APPLIED');
    await service.remove('user-A', 'job-1');

    expect(repo.findAll).toHaveBeenCalledWith('user-A', {});
    expect(repo.findOne).toHaveBeenCalledWith('user-A', 'job-1');
    expect(repo.update).toHaveBeenCalledWith('user-A', 'job-1', { notes: 'x' });
    expect(repo.updateStatus).toHaveBeenCalledWith(
      'user-A',
      'job-1',
      'APPLIED',
    );
    expect(repo.delete).toHaveBeenCalledWith('user-A', 'job-1');
  });

  it('validates and forwards parsed list filters', async () => {
    await service.findAll('user-A', {
      status: 'APPLIED',
      source: 'linkedin',
      search: '  acme  ',
    });
    expect(repo.findAll).toHaveBeenCalledWith('user-A', {
      status: 'APPLIED',
      source: 'linkedin',
      search: 'acme',
    });
  });

  it('rejects an invalid list filter without touching the repository', () => {
    expect(() => service.findAll('user-A', { status: 'HIRED' })).toThrow(
      BadRequestException,
    );
    expect(repo.findAll).not.toHaveBeenCalled();
  });

  it('validates and forwards parsed data on create', async () => {
    await service.create('user-A', {
      title: 'Eng',
      company: 'Acme',
      url: 'https://s/1',
      source: 'manual',
    });
    expect(repo.create).toHaveBeenCalledWith('user-A', {
      title: 'Eng',
      company: 'Acme',
      url: 'https://s/1',
      source: 'manual',
    });
  });

  it('rejects an invalid create, logs the failed extraction, and never hits the DB', () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    expect(() =>
      service.create('user-A', {
        title: '',
        company: '',
        source: 'linkedin',
        url: 'https://li/1',
      }),
    ).toThrow(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('source=linkedin'),
    );
    warn.mockRestore();
  });

  it('rejects an invalid status without touching the repository', () => {
    expect(() => service.updateStatus('user-A', 'job-1', 'HIRED')).toThrow(
      BadRequestException,
    );
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('rejects an invalid update payload', () => {
    expect(() => service.update('user-A', 'job-1', { status: 'NOPE' })).toThrow(
      BadRequestException,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });
});
