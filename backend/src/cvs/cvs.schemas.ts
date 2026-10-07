import { z } from 'zod';

export const cvLabelSchema = z
  .string()
  .trim()
  .min(1, 'Label is required')
  .max(120);

// On upload the label is optional: the service derives one from the parsed
// name/headline so a user who never renames anything still ends up with a
// readable identifier instead of a stray word. A rename via PATCH still has to
// carry a real label.
export const cvUploadLabelSchema = z.string().trim().max(120);

export const createCvSchema = z.object({ label: cvLabelSchema });

// PATCH accepts a rename and/or the default toggle independently.
export const updateCvSchema = z.object({
  label: cvLabelSchema.optional(),
  is_default: z.boolean().optional(),
});

export type CreateCvInput = z.infer<typeof createCvSchema>;
export type UpdateCvInput = z.infer<typeof updateCvSchema>;
