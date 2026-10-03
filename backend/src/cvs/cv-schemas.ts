import { z } from 'zod';

// One shared output shape for both parsers (rule-based and AI) so nothing
// downstream cares which one ran.
export const cvEntrySchema = z.object({
  // Raw entry text — title/company/description are NOT decomposed without AI.
  text: z.string().trim().min(1).max(20000),
  dateRange: z.string().trim().max(100).optional(),
});

export const cvStructuredDataSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(300).optional(),
  phone: z.string().trim().max(50).optional(),
  links: z.array(z.string().trim().url().max(2000)).max(20).optional(),
  experience: z.array(cvEntrySchema).max(100).default([]),
  education: z.array(cvEntrySchema).max(100).default([]),
  skills: z.array(z.string().trim().min(1).max(100)).max(300).default([]),
});

export type CvStructuredData = z.infer<typeof cvStructuredDataSchema>;
export type CvEntry = z.infer<typeof cvEntrySchema>;
