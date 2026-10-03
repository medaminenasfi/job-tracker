import { Test } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { DbService } from '../db/db.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let db: { query: jest.Mock };

  beforeEach(async () => {
    db = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [AnalyticsService, { provide: DbService, useValue: db }],
    }).compile();
    service = module.get(AnalyticsService);
  });

  it('computes rates from status counts', async () => {
    db.query.mockResolvedValue({
      rows: [
        { status: 'SAVED', count: 5 },
        { status: 'APPLIED', count: 4 },
        { status: 'INTERVIEW', count: 2 },
        { status: 'OFFER', count: 1 },
        { status: 'REJECTED', count: 3 },
      ],
    });
    const s = await service.summary('u1');
    expect(s.total).toBe(15);
    expect(s.applied).toBe(10);
    // responded = interview 2 + offer 1 + rejected 3 = 6 of 10 → 60%
    expect(s.responseRate).toBe(60);
    expect(s.interviewRate).toBe(30);
  });

  it('returns zero rates when there are no applications', async () => {
    db.query.mockResolvedValue({ rows: [{ status: 'SAVED', count: 2 }] });
    const s = await service.summary('u1');
    expect(s.responseRate).toBe(0);
    expect(s.interviewRate).toBe(0);
  });

  it('falls back to a 30-day window for unknown ranges', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await service.timeline('u1', 'bogus');
    const calls = db.query.mock.calls as [string, unknown[]][];
    expect(calls[0][1]).toEqual(['u1', '30']);
  });
});
