import { SetMetadata } from '@nestjs/common';

export type UserRole = 'USER' | 'ADMIN';

export const ROLES_KEY = 'roles';

// Marks a route/class as requiring one of the given roles. Enforced by RolesGuard,
// which reads the role from req.user (re-derived from the DB on every request).
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
