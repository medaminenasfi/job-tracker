import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let query: jest.Mock;
  let service: DashboardService;

  beforeEach(() => {
    query = jest.fn();
    service = new DashboardService({ query } as never);
  });

  // Resolves the five Promise.all queries in order:
  // status, activity, flags, recent, sparkline.
  function mockQueries(opts: {
    status?: { status: string; count: number }[];
    activity?: { week: number; month: number };
    flags?: { extension: boolean; applied: boolean };
    recent?: unknown[];
    spark?: { day: string; count: number }[];
  }) {
    query
      .mockResolvedValueOnce({ rows: opts.status ?? [] })
      .mockResolvedValueOnce({ rows: [opts.activity ?? { week: 0, month: 0 }] })
      .mockResolvedValueOnce({
        rows: [opts.flags ?? { extension: false, applied: false }],
      })
      .mockResolvedValueOnce({ rows: opts.recent ?? [] })
      .mockResolvedValueOnce({ rows: opts.spark ?? [] });
  }

  it('aggregates counts, activity, checklist and announcements for a user with data', async () => {
    mockQueries({
      status: [
        { status: 'SAVED', count: 2 },
        { status: 'APPLIED', count: 3 },
        { status: 'INTERVIEW', count: 1 },
      ],
      activity: { week: 4, month: 9 },
      flags: { extension: true, applied: true },
      recent: [{ id: 'j1', title: 'Dev', company: 'Acme', status: 'APPLIED' }],
    });

    const summary = await service.getSummary('u1');

    expect(summary.counts).toMatchObject({
      total: 6,
      saved: 2,
      applied: 3,
      interview: 1,
      offer: 0,
    });
    expect(summary.activity.appliedThisWeek).toBe(4);
    expect(summary.activity.appliedThisMonth).toBe(9);
    expect(summary.activity.last7Days).toHaveLength(7);
    expect(summary.recentJobs).toHaveLength(1);
    expect(summary.checklist).toEqual({
      accountCreated: true,
      extensionConnected: true,
      firstJobSaved: true,
      appliedJob: true,
    });
    expect(summary.announcements.length).toBeGreaterThan(0);
  });

  it('returns zeros and an incomplete checklist for a brand-new user', async () => {
    mockQueries({});

    const summary = await service.getSummary('new-user');

    expect(summary.counts.total).toBe(0);
    expect(summary.counts.saved).toBe(0);
    expect(summary.activity).toEqual({
      appliedThisWeek: 0,
      appliedThisMonth: 0,
      last7Days: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(summary.recentJobs).toEqual([]);
    expect(summary.checklist).toEqual({
      accountCreated: true,
      extensionConnected: false,
      firstJobSaved: false,
      appliedJob: false,
    });
  });

  it('places sparkline counts into the correct day bucket (today last)', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.toISOString().slice(0, 10);
    mockQueries({ spark: [{ day: todayKey, count: 5 }] });

    const summary = await service.getSummary('u1');
    expect(summary.activity.last7Days).toEqual([0, 0, 0, 0, 0, 0, 5]);
  });
});
