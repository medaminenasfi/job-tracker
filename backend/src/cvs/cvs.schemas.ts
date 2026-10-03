import { z } from 'zod';

export const cvLabelSchema = z
  .string()
  .trim()
  .min(1, 'Label is required')
  .max(120);

export const createCvSchema = z.object({ label: cvLabelSchema });

// PATCH accepts a rename and/or the default toggle independently.
export const updateCvSchema = z.object({
  label: cvLabelSchema.optional(),
  is_default: z.boolean().optional(),
});

export type CreateCvInput = z.infer<typeof createCvSchema>;
export type UpdateCvInput = z.infer<typeof updateCvSchema>;
