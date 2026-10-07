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
    cvData?: {
      skills?: string[];
      experience?: { text: string; dateRange?: string }[];
      education?: { text: string; dateRange?: string }[];
    } | null,
  ): Promise<JobMatchResult> {
    // Prefer CV skills/experience over profile when available
    const effectiveSkills = cvData?.skills?.length ? cvData.skills : profile.skills ?? [];
    const cvExperience = cvData?.experience ?? [];
    const cvEducation = cvData?.education ?? [];

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
              skills: effectiveSkills,
            },
            cv: cvData
              ? {
                  skills: cvData.skills ?? [],
                  experience: cvExperience,
                  education: cvEducation,
                }
              : null,
          }),
        },
      ],
      jobMatchResultSchema,
    );
  }
}
