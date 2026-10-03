import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsRepository } from './jobs.repository';
import { DbService } from '../db/db.service';
import { AiService } from '../ai/ai.service';
import { JobMatchService } from '../ai/job-match.service';

describe('JobsService.computeMatch', () => {
  let service: JobsService;
  let db: { query: jest.Mock };
  let ai: { enforceMonthlyCap: jest.Mock; recordCall: jest.Mock };
  let jobMatch: { computeMatch: jest.Mock };

  const freshJob = {
    id: 'j1',
    title: 'Dev',
    company: 'Co',
    description: 'desc',
    updated_at: new Date().toISOString(),
    match_score: null,
    match_skills_matched: null,
    match_skills_missing: null,
    match_computed_at: null,
  };
  const profile = {
    headline: 'Dev',
    years_experience: 3,
    skills: ['ts'],
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    db = { query: jest.fn() };
    ai = { enforceMonthlyCap: jest.fn(), recordCall: jest.fn() };
    jobMatch = { computeMatch: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: JobsRepository, useValue: {} },
        { provide: DbService, useValue: db },
        { provide: AiService, useValue: ai },
        { provide: JobMatchService, useValue: jobMatch },
      ],
    }).compile();
    service = module.get(JobsService);
  });

  function mockJobThenProfile(jobRow: unknown, profileRow: unknown) {
    db.query
      .mockResolvedValueOnce({ rows: jobRow ? [jobRow] : [] })
      .mockResolvedValueOnce({ rows: profileRow ? [profileRow] : [] });
  }

  it('computes and stores a fresh match', async () => {
    mockJobThenProfile(freshJob, profile);
    db.query.mockResolvedValueOnce({ rows: [] }); // UPDATE
    jobMatch.computeMatch.mockResolvedValue({
      score: 80,
      matchedSkills: ['ts'],
      missingSkills: ['go'],
    });
    const result = await service.computeMatch('u1', 'j1');
    expect(result.cached).toBe(false);
    expect(result.score).toBe(80);
    expect(ai.enforceMonthlyCap).toHaveBeenCalledWith('u1');
    expect(ai.recordCall).toHaveBeenCalledWith('u1');
  });

  it('returns the cached result when nothing changed', async () => {
    const computed = new Date();
    mockJobThenProfile(
      {
        ...freshJob,
        match_score: 70,
        match_skills_matched: ['ts'],
        match_skills_missing: [],
        match_computed_at: new Date(computed.getTime() + 1000).toISOString(),
        updated_at: new Date(computed.getTime() - 1000).toISOString(),
      },
      {
        ...profile,
        updated_at: new Date(computed.getTime() - 1000).toISOString(),
      },
    );
    const result = await service.computeMatch('u1', 'j1');
    expect(result).toMatchObject({ score: 70, cached: true });
    expect(jobMatch.computeMatch).not.toHaveBeenCalled();
    expect(ai.enforceMonthlyCap).not.toHaveBeenCalled();
  });

  it('throws when the job is not found', async () => {
    mockJobThenProfile(null, profile);
    await expect(service.computeMatch('u1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires profile skills before calling the AI', async () => {
    mockJobThenProfile(freshJob, { ...profile, skills: [] });
    await expect(service.computeMatch('u1', 'j1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(jobMatch.computeMatch).not.toHaveBeenCalled();
  });

  it('setFollowUp validates input and scopes by user', async () => {
    db.query.mockResolvedValue({
      rows: [{ id: 'j1', follow_up_at: 'x', follow_up_sent: false }],
    });
    await service.setFollowUp('u1', 'j1', '2030-01-01');
    const calls = db.query.mock.calls as [string, unknown[]][];
    expect(calls[0][0]).toContain('WHERE id = $2 AND user_id = $3');

    await expect(
      service.setFollowUp('u1', 'j1', 'not-a-date'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setFollowUp('u1', 'j1', null)).resolves.toBeTruthy();
  });

  it('propagates AI failures without storing anything', async () => {
    mockJobThenProfile(freshJob, profile);
    jobMatch.computeMatch.mockRejectedValue(
      new ServiceUnavailableException('AI request failed'),
    );
    await expect(service.computeMatch('u1', 'j1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(db.query).toHaveBeenCalledTimes(2); // job + profile only, no UPDATE
  });
});
