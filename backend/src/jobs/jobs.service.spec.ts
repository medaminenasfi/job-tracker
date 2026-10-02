import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
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
      delete: jest.fn().mockResolvedValue(true),
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

  it('forwards a custom status list filter', () => {
    service.findAll('user-A', { status: 'Phone screen' });
    expect(repo.findAll).toHaveBeenCalledWith('user-A', {
      status: 'Phone screen',
    });
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

  it('rejects an invalid create, logs the failed extraction, and never hits the DB', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    await expect(
      service.create('user-A', {
        title: '',
        company: '',
        source: 'linkedin',
        url: 'https://li/1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('source=linkedin'),
    );
    warn.mockRestore();
  });

  it('accepts a custom status name for updates', async () => {
    await expect(
      service.updateStatus('user-A', 'job-1', 'Phone screen'),
    ).resolves.toEqual({ id: 'job-1' });
    expect(repo.updateStatus).toHaveBeenCalledWith(
      'user-A',
      'job-1',
      'Phone screen',
    );
  });

  it('rejects a blank update status', async () => {
    await expect(
      service.update('user-A', 'job-1', { status: ' ' }),
    ).rejects.toThrow(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('JobsService missing/foreign job handling', () => {
  let repo: jest.Mocked<
    Pick<
      JobsRepository,
      'create' | 'findAll' | 'findOne' | 'update' | 'updateStatus' | 'delete'
    >
  >;
  let service: JobsService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(false),
    };
    service = new JobsService(repo as unknown as JobsRepository);
  });

  it('throws NotFound (not an empty 200) when the job is missing or foreign', async () => {
    await expect(service.findOne('user-B', 'job-1')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.update('user-B', 'job-1', { notes: 'x' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.updateStatus('user-B', 'job-1', 'APPLIED'),
    ).rejects.toThrow(NotFoundException);
    await expect(service.remove('user-B', 'job-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
