import { z } from 'zod';

export const pingResultSchema = z.object({
  ok: z.boolean(),
  echo: z.string(),
});
export type PingResult = z.infer<typeof pingResultSchema>;

export const pingRequestSchema = z.object({
  message: z.string().min(1).max(500),
});

export const jobMatchResultSchema = z.object({
  score: z.number().min(0).max(100),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
});
export type JobMatchResult = z.infer<typeof jobMatchResultSchema>;
