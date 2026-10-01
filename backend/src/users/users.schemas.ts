import { z } from 'zod';

// currentPassword is optional so a Google-only account (no password yet) can set
// its first password. When the account already has a password, the service
// requires and verifies currentPassword before allowing the change.
export const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
