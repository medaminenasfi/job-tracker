import { Test } from '@nestjs/testing';
import { CompaniesService } from './companies.service';
import { DbService } from '../db/db.service';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let db: { query: jest.Mock };

  beforeEach(async () => {
    db = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [CompaniesService, { provide: DbService, useValue: db }],
    }).compile();
    service = module.get(CompaniesService);
  });

  it('groups companies case-insensitively and scoped to the user', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await service.list('u1');
    const calls = db.query.mock.calls as [string, unknown[]][];
    expect(calls[0][0]).toContain('GROUP BY lower(company)');
    expect(calls[0][1]).toEqual(['u1']);
  });

  it('matches company names case-insensitively for jobs', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await service.jobsFor('u1', 'Google');
    const calls = db.query.mock.calls as [string, unknown[]][];
    expect(calls[0][0]).toContain('lower(company) = lower($2)');
    expect(calls[0][1]).toEqual(['u1', 'Google']);
  });
});
