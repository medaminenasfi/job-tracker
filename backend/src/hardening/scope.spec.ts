// Phase 6 hardening: every new service method must filter by the caller's
// user_id — a missing filter is a cross-user data leak.
import { Test } from '@nestjs/testing';
import { ProfileService } from '../profile/profile.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { CompaniesService } from '../companies/companies.service';
import { DbService } from '../db/db.service';

describe('cross-user scoping (Phase 6)', () => {
  let db: { query: jest.Mock };

  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  });

  async function setup() {
    const module = await Test.createTestingModule({
      providers: [
        ProfileService,
        NotificationsService,
        AnalyticsService,
        CompaniesService,
        { provide: DbService, useValue: db },
      ],
    }).compile();
    return {
      profile: module.get(ProfileService),
      notifications: module.get(NotificationsService),
      analytics: module.get(AnalyticsService),
      companies: module.get(CompaniesService),
    };
  }

  it('profile get/upsert filter by user_id', async () => {
    const { profile } = await setup();
    await profile.get('u1');
    await profile.upsert('u1', { headline: 'x' });
    for (const call of db.query.mock.calls as [string, unknown[]][]) {
      expect(call[0]).toMatch(/user_id|WHERE id = \$1|VALUES \(\$1/);
      expect(call[1][0]).toBe('u1');
    }
  });

  it('notifications list/markRead filter by user_id', async () => {
    const { notifications } = await setup();
    await notifications.list('u1');
    await notifications.markRead('u1', 'n1').catch(() => undefined);
    const calls = db.query.mock.calls as [string, unknown[]][];
    expect(calls[0][0]).toContain('WHERE user_id = $1');
    expect(calls[0][1]).toEqual(['u1']);
    expect(calls[1][0]).toContain('AND user_id = $2');
    expect(calls[1][1]).toEqual(['n1', 'u1']);
  });

  it('analytics endpoints filter by user_id', async () => {
    const { analytics } = await setup();
    await analytics.summary('u1');
    await analytics.bySource('u1');
    await analytics.timeline('u1', '7d');
    for (const call of db.query.mock.calls as [string, unknown[]][]) {
      expect(call[0]).toContain('user_id = $1');
      expect(call[1][0]).toBe('u1');
    }
  });

  it('companies endpoints filter by user_id', async () => {
    const { companies } = await setup();
    await companies.list('u1');
    await companies.jobsFor('u1', 'Acme');
    const calls = db.query.mock.calls as [string, unknown[]][];
    expect(calls[0][0]).toContain('user_id = $1');
    expect(calls[1][0]).toContain('user_id = $1');
    expect(calls[1][1]).toEqual(['u1', 'Acme']);
  });

  it('jobs match queries filter by both job id and user_id', async () => {
    // jobs.match.spec covers this behavior; assert presence of the WHERE clause.
    const fs = await import('fs');
    const src = fs.readFileSync(`${__dirname}/../jobs/jobs.service.ts`, 'utf8');
    expect(src).toContain('WHERE id = $1 AND user_id = $2');
    expect(src).toContain('WHERE id = $4 AND user_id = $5');
  });
});
