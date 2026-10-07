import { z } from 'zod';
import {
  CV_TEMPLATE_PLACEHOLDERS,
  type CvTemplatePlaceholder,
} from './latex-template';

// Per-field caps keep one merged document well under any sane PDF size and stop a
// caller from pushing megabytes into the sandbox.
const FIELD_MAX_LENGTH: Record<CvTemplatePlaceholder, number> = {
  fullName: 200,
  headline: 200,
  profile: 5000,
  email: 300,
  phone: 50,
  links: 2000,
  experience: 20000,
  education: 20000,
  certificates: 5000,
  skills: 5000,
};

// Derived from the single placeholder list so a new placeholder cannot be
// accepted here without also being documented in the templates catalogue.
export const buildCvFieldsSchema = z
  .object(
    Object.fromEntries(
      CV_TEMPLATE_PLACEHOLDERS.map((name) => [
        name,
        z
          .string()
          .trim()
          .max(FIELD_MAX_LENGTH[name], `${name} is too long`)
          .optional(),
      ]),
    ) as Record<CvTemplatePlaceholder, z.ZodOptional<z.ZodString>>,
  )
  .strict();

export const buildCvSchema = z.object({
  template_id: z.string().uuid('Invalid template id'),
  fields: buildCvFieldsSchema.default({}),
});

export type BuildCvInput = z.infer<typeof buildCvSchema>;
