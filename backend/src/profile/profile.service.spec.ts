import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { DbService } from '../db/db.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let db: { query: jest.Mock };

  beforeEach(async () => {
    db = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [ProfileService, { provide: DbService, useValue: db }],
    }).compile();
    service = module.get(ProfileService);
  });

  it('returns defaults when no profile exists', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const profile = (await service.get('u1')) as {
      headline: string | null;
      skills: string[];
    };
    expect(profile).toEqual({
      headline: null,
      yearsExperience: null,
      skills: [],
      bio: null,
      updatedAt: null,
    });
  });

  it('upserts a valid profile', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          headline: 'Dev',
          yearsExperience: 3,
          skills: ['ts'],
          bio: 'hi',
          updatedAt: null,
        },
      ],
    });
    const result = (await service.upsert('u1', {
      headline: 'Dev',
      yearsExperience: 3,
      skills: ['ts'],
      bio: 'hi',
    })) as { headline: string };
    expect(result.headline).toBe('Dev');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT'),
      ['u1', 'Dev', 3, ['ts'], 'hi'],
    );
  });

  it('rejects invalid input', async () => {
    await expect(
      service.upsert('u1', { yearsExperience: -5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upsert('u1', { skills: [42] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
