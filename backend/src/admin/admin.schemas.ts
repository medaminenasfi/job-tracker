import { z } from 'zod';
import { jobStatusSchema, jobSourceSchema } from '../jobs/jobs.schemas';

// Admin registration is invite-only: a valid, unused, unexpired token is required.
export const adminRegisterSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  token: z.string().trim().min(1, 'Invite token is required'),
});

export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const accountStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);
export const userRoleSchema = z.enum(['USER', 'ADMIN']);

export const updateAccountStatusSchema = z.object({
  status: accountStatusSchema,
});
export const updateUserRoleSchema = z.object({ role: userRoleSchema });

// Admin-only direct user creation. Reuses the register field validators
// (name/email/password) minus the invite token, plus an explicit role.
export const adminCreateUserSchema = adminRegisterSchema
  .omit({ token: true })
  .extend({ role: userRoleSchema });

export const createInviteSchema = z.object({
  // Optional TTL override; defaults to 7 days in the service.
  expires_in_days: z.coerce.number().int().min(1).max(90).optional(),
});

// Query-string booleans arrive as strings, and z.coerce.boolean() would turn
// "false" into true — so only the literal truthy spellings count.
export const booleanQuerySchema = z.preprocess(
  (value) =>
    value === undefined || value === ''
      ? undefined
      : value === true || value === 'true' || value === '1',
  z.boolean().default(false),
);

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

// Pagination + filters shared by the admin users/jobs/audit lists. Coerced so
// query-string values ("2") parse to numbers; clamped to sane bounds.
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminUsersQuerySchema = paginationSchema.extend({
  search: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
  role: userRoleSchema.optional(),
  status: accountStatusSchema.optional(),
});

export const adminJobsQuerySchema = paginationSchema.extend({
  user_id: z.preprocess(
    emptyToUndefined,
    z.string().uuid('Invalid user id').optional(),
  ),
  status: jobStatusSchema.optional(),
  source: jobSourceSchema.optional(),
});

export type AdminRegisterInput = z.infer<typeof adminRegisterSchema>;
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminJobsQuery = z.infer<typeof adminJobsQuerySchema>;

// ---- CV templates (MVP3 Phase 3) ----

// `language` drives MVP7's localisation of the template gallery; keep it a
// closed set so an unknown locale can never be stored.
export const templateLanguageSchema = z.enum(['en', 'fr']);

const latexSourceSchema = z
  .string()
  .trim()
  .min(1, 'LaTeX source is required')
  .max(200_000, 'LaTeX source is too large (max 200 KB)');

// Kept default-free so the PATCH schema can reuse it: a default on a `.partial()`
// field would silently reset the omitted column on every update.
const cvTemplateFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(2000).optional(),
  ),
  preview_image_url: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .url('Preview image must be a valid URL')
      .max(2000)
      .optional(),
  ),
  latex_source: latexSourceSchema,
  language: templateLanguageSchema,
  is_active: z.boolean(),
});

export const createCvTemplateSchema = cvTemplateFieldsSchema.extend({
  language: templateLanguageSchema.default('en'),
  is_active: z.boolean().default(true),
});

export const updateCvTemplateSchema = cvTemplateFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const cvTemplatePreviewSchema = z.object({
  latex_source: latexSourceSchema,
});

export type CreateCvTemplateInput = z.infer<typeof createCvTemplateSchema>;
export type UpdateCvTemplateInput = z.infer<typeof updateCvTemplateSchema>;
