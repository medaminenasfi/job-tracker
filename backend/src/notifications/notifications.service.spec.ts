import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { DbService } from '../db/db.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let db: { query: jest.Mock };

  beforeEach(async () => {
    db = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [NotificationsService, { provide: DbService, useValue: db }],
    }).compile();
    service = module.get(NotificationsService);
  });

  it('creates one notification per overdue job and marks it sent', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ id: 'j1', user_id: 'u1', title: 'Dev', company: 'Co' }],
      })
      .mockResolvedValue({ rows: [] });
    await service.sweepFollowUps();
    expect(db.query).toHaveBeenCalledTimes(3);
    const calls = db.query.mock.calls as [string, unknown[]?][];
    expect(calls[1][0]).toContain('INSERT INTO notifications');
    expect(calls[2][0]).toContain('follow_up_sent = true');
  });

  it('does nothing when no jobs are due', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await service.sweepFollowUps();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('markRead rejects unknown ids', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(service.markRead('u1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
