import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminRepository } from './admin.repository';
import { AuthService } from '../auth/auth.service';
import { ADMIN_COOKIE } from '../auth/auth.cookies';
import {
  adminLoginSchema,
  adminRegisterSchema,
  adminCreateUserSchema,
  createInviteSchema,
  updateAccountStatusSchema,
  updateUserRoleSchema,
  adminUsersQuerySchema,
  adminJobsQuerySchema,
  paginationSchema,
} from './admin.schemas';

const DEFAULT_INVITE_TTL_DAYS = 7;

@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepo: AdminRepository,
    private readonly authService: AuthService,
  ) {}

  // Admin login reuses the shared credential check, then additionally requires
  // the ADMIN role and an active account.
  async login(data: unknown, res?: Response) {
    const parsed = adminLoginSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    const user = await this.authService.verifyCredentials(
      parsed.data.email,
      parsed.data.password,
    );
    if (user.role !== 'ADMIN')
      throw new ForbiddenException('Admin access required');
    if (user.account_status === 'SUSPENDED')
      throw new UnauthorizedException('Account suspended');
    return this.authService.issueSession(user.id, user.role, res, ADMIN_COOKIE);
  }

  // Invite-only admin registration: the token is atomically consumed first so it
  // can never be redeemed twice.
  async register(data: unknown, res?: Response) {
    const parsed = adminRegisterSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    const inviteId = await this.adminRepo.consumeInvite(parsed.data.token);
    if (!inviteId) throw new UnauthorizedException('Invalid or expired invite');
    const { name, email, password } = parsed.data;
    const id = await this.authService.createUser(
      name,
      email,
      password,
      'ADMIN',
    );
    return this.authService.issueSession(id, 'ADMIN', res, ADMIN_COOKIE);
  }

  // Admin session refresh + logout are independent of the user session: they read
  // and clear the separate adminRefreshToken cookie. Access control is enforced on
  // every admin route by RolesGuard (role re-read from the DB), so issuing a fresh
  // token here is never a privilege escalation.
  refresh(refreshToken: string | undefined, res: Response) {
    return this.authService.refresh(refreshToken, res, ADMIN_COOKIE);
  }

  logout(refreshToken: string | undefined, res: Response) {
    return this.authService.logout(refreshToken, res, ADMIN_COOKIE);
  }

  async createInvite(adminId: string, data: unknown) {
    const parsed = createInviteSchema.safeParse(data ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    const days = parsed.data.expires_in_days ?? DEFAULT_INVITE_TTL_DAYS;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const token = await this.adminRepo.createInvite(adminId, expiresAt);
    return { token, expires_at: expiresAt.toISOString() };
  }

  getStats() {
    return this.adminRepo.getStats();
  }

  // Admin-only direct account creation (USER or ADMIN). Reuses AuthService.createUser
  // so password hashing + duplicate-email handling stay in one place, audit-logs the
  // action, and returns the row via getUser() so password_hash is never exposed.
  async createUser(adminId: string, data: unknown) {
    const parsed = adminCreateUserSchema.safeParse(data ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    const { name, email, password, role } = parsed.data;
    const id = await this.authService.createUser(name, email, password, role);
    const action = role === 'ADMIN' ? 'ADMIN_CREATED' : 'USER_CREATED';
    await this.adminRepo.writeAuditLog(adminId, action, 'user', id);
    const created = await this.adminRepo.getUser(id);
    return created;
  }

  async listUsers(query: unknown) {
    const parsed = adminUsersQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid query',
      );
    }
    return this.adminRepo.listUsers(parsed.data);
  }

  async getUser(id: string) {
    const user = await this.adminRepo.getUser(id);
    if (!user) throw new NotFoundException('User not found');
    const [jobCounts, jobs] = await Promise.all([
      this.adminRepo.getUserJobCounts(id),
      this.adminRepo.getUserJobs(id),
    ]);
    return { ...user, jobCounts, jobs };
  }

  async updateUserStatus(adminId: string, id: string, data: unknown) {
    const parsed = updateAccountStatusSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid status',
      );
    }
    if (adminId === id && parsed.data.status === 'SUSPENDED') {
      throw new BadRequestException('You cannot suspend your own account');
    }
    const target = await this.adminRepo.getUser(id);
    if (!target) throw new NotFoundException('User not found');
    const updated = await this.adminRepo.updateUserStatus(
      id,
      parsed.data.status,
    );
    const action =
      parsed.data.status === 'SUSPENDED'
        ? 'USER_SUSPENDED'
        : 'USER_REACTIVATED';
    await this.adminRepo.writeAuditLog(adminId, action, 'user', id);
    return updated;
  }

  async updateUserRole(adminId: string, id: string, data: unknown) {
    const parsed = updateUserRoleSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid role',
      );
    }
    if (adminId === id && parsed.data.role === 'USER') {
      throw new BadRequestException('You cannot demote yourself');
    }
    const target = await this.adminRepo.getUser(id);
    if (!target) throw new NotFoundException('User not found');
    // Demoting an admin must not leave the platform with zero admins.
    if (target.role === 'ADMIN' && parsed.data.role === 'USER') {
      const admins = await this.adminRepo.countAdmins();
      if (admins <= 1)
        throw new BadRequestException('Cannot demote the last remaining admin');
    }
    const updated = await this.adminRepo.updateUserRole(id, parsed.data.role);
    const action =
      parsed.data.role === 'ADMIN' ? 'USER_PROMOTED' : 'USER_DEMOTED';
    await this.adminRepo.writeAuditLog(adminId, action, 'user', id);
    return updated;
  }

  async deleteUser(adminId: string, id: string) {
    if (adminId === id)
      throw new BadRequestException('You cannot delete your own account');
    const target = await this.adminRepo.getUser(id);
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN') {
      const admins = await this.adminRepo.countAdmins();
      if (admins <= 1)
        throw new BadRequestException('Cannot delete the last remaining admin');
    }
    await this.adminRepo.deleteUser(id);
    await this.adminRepo.writeAuditLog(adminId, 'USER_DELETED', 'user', id);
    return { deleted: true };
  }

  async listJobs(query: unknown) {
    const parsed = adminJobsQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid query',
      );
    }
    return this.adminRepo.listJobs(parsed.data);
  }

  async getJob(id: string) {
    const job = await this.adminRepo.getJob(id);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async deleteJob(adminId: string, id: string) {
    const job = await this.adminRepo.getJob(id);
    if (!job) throw new NotFoundException('Job not found');
    await this.adminRepo.deleteJob(id);
    await this.adminRepo.writeAuditLog(adminId, 'JOB_DELETED', 'job', id);
    return { deleted: true };
  }

  async listAuditLogs(query: unknown) {
    const parsed = paginationSchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid query',
      );
    }
    return this.adminRepo.listAuditLogs(parsed.data.page, parsed.data.limit);
  }
}
