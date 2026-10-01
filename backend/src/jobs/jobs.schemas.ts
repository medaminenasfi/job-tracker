import { z } from 'zod';

export const jobStatusSchema = z.string().trim().min(1).max(60);

export const jobSourceSchema = z.enum([
  'linkedin',
  'indeed',
  'generic',
  'manual',
]);

// The web form submits empty strings for untouched optional fields; treat those
// as "not provided" so they neither fail validation nor create false duplicates.
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

// On UPDATE an empty/whitespace note means "clear it" (persist NULL), not "leave
// unchanged" — otherwise a user could never delete a note they added. Create keeps
// empty→undefined so untouched optional fields don't overwrite values or trip the
// url dedup index.
const clearableText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

export const createJobSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  company: z.string().trim().min(1, 'Company is required').max(300),
  location: optionalText(300),
  url: z.preprocess(
    emptyToUndefined,
    z.string().trim().url('Invalid URL').max(2000).optional(),
  ),
  source: z.preprocess(emptyToUndefined, jobSourceSchema.optional()),
  description: optionalText(20000),
  salary: optionalText(200),
  employment_type: optionalText(100),
  status: jobStatusSchema.optional(),
  notes: optionalText(20000),
});

export const updateJobSchema = createJobSchema.partial().extend({
  notes: clearableText(20000),
});

export const updateStatusSchema = z.object({ status: jobStatusSchema });

// Optional list filters for GET /jobs (?status=&search=&source=). Every field is
// optional so the unfiltered call still returns all of the user's jobs.
export const jobQuerySchema = z.object({
  status: jobStatusSchema.optional(),
  source: jobSourceSchema.optional(),
  search: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type JobQuery = z.infer<typeof jobQuerySchema>;
