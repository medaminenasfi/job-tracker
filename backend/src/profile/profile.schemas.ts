import { z } from 'zod';

export const upsertProfileSchema = z.object({
  headline: z.string().max(200).nullish(),
  yearsExperience: z.number().int().min(0).max(70).nullish(),
  skills: z.array(z.string().min(1).max(50)).max(50).optional(),
  bio: z.string().max(2000).nullish(),
});

export type UpsertProfileInput = z.infer<typeof upsertProfileSchema>;
