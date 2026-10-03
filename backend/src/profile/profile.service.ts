import { BadRequestException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { upsertProfileSchema } from './profile.schemas';

@Injectable()
export class ProfileService {
  constructor(private readonly db: DbService) {}

  async get(userId: string) {
    const result = await this.db.query(
      `SELECT headline, years_experience AS "yearsExperience", skills, bio, updated_at AS "updatedAt"
         FROM user_profiles WHERE user_id = $1`,
      [userId],
    );
    return (
      (result.rows[0] as
        | {
            headline: string | null;
            yearsExperience: number | null;
            skills: string[];
            bio: string | null;
            updatedAt: string | null;
          }
        | undefined) ?? {
        headline: null,
        yearsExperience: null,
        skills: [],
        bio: null,
        updatedAt: null,
      }
    );
  }

  async upsert(userId: string, data: unknown) {
    const parsed = upsertProfileSchema.safeParse(data ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid profile',
      );
    }
    const { headline, yearsExperience, skills, bio } = parsed.data;
    const result = await this.db.query(
      `INSERT INTO user_profiles (user_id, headline, years_experience, skills, bio, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE
         SET headline = EXCLUDED.headline,
             years_experience = EXCLUDED.years_experience,
             skills = EXCLUDED.skills,
             bio = EXCLUDED.bio,
             updated_at = now()
       RETURNING headline, years_experience AS "yearsExperience", skills, bio, updated_at AS "updatedAt"`,
      [
        userId,
        headline ?? null,
        yearsExperience ?? null,
        skills ?? [],
        bio ?? null,
      ],
    );
    return result.rows[0] as {
      headline: string | null;
      yearsExperience: number | null;
      skills: string[];
      bio: string | null;
      updatedAt: string | null;
    };
  }
}
