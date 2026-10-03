import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { jobMatchResultSchema, JobMatchResult } from './ai.schemas';

@Injectable()
export class JobMatchService {
  constructor(private readonly ai: AiService) {}

  computeMatch(
    job: { title: string; company: string; description?: string | null },
    profile: {
      headline?: string | null;
      yearsExperience?: number | null;
      skills?: string[];
    },
  ): Promise<JobMatchResult> {
    return this.ai.completeJson(
      [
        {
          role: 'system',
          content:
            'You match a candidate profile to a job. Reply with strict JSON: ' +
            '{"score": <0-100 integer>, "matchedSkills": [...], "missingSkills": [...]}.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            job,
            profile: {
              headline: profile.headline ?? null,
              yearsExperience: profile.yearsExperience ?? null,
              skills: profile.skills ?? [],
            },
          }),
        },
      ],
      jobMatchResultSchema,
    );
  }
}
