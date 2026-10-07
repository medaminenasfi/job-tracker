import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AdminRepository } from './admin.repository';
import { AuthService } from '../auth/auth.service';
import { ADMIN_COOKIE } from '../auth/auth.cookies';
import {
  LatexPreviewService,
  PreviewSupersededException,
  previewDataUrl,
} from '../latex/latex-preview.service';
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
  booleanQuerySchema,
  createCvTemplateSchema,
  updateCvTemplateSchema,
  cvTemplatePreviewSchema,
} from './admin.schemas';
import type { LatexFailure } from '../latex/latex-log';
import {
  CV_TEMPLATE_FIELD_META,
  CV_TEMPLATE_PLACEHOLDERS,
  CV_TEMPLATE_SAMPLE_DATA,
  LatexTemplateError,
  mergeTemplate,
  validateTemplateSource,
} from '../latex/latex-template';

const DEFAULT_INVITE_TTL_DAYS = 7;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly adminRepo: AdminRepository,
    private readonly authService: AuthService,
    private readonly previews: LatexPreviewService,
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

  // ---- CV templates (MVP3 Phase 3) ----

  // Placeholder catalogue so the admin UI can document exactly what a template
  // may embed: the token to insert, a human label, what the field holds, and
  // whether the builder renders it as a multi-line textarea (each line becomes
  // its own line in the PDF).
  getCvTemplatePlaceholders() {
    return {
      placeholders: CV_TEMPLATE_PLACEHOLDERS.map((name) => ({
        name,
        token: `{{${name}}}`,
        ...CV_TEMPLATE_FIELD_META[name],
      })),
    };
  }

  async listCvTemplates(query: unknown) {
    const parsed = z
      .object({ include_inactive: booleanQuerySchema })
      .safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid query',
      );
    }
    return this.adminRepo.listCvTemplates(parsed.data.include_inactive);
  }

  async getCvTemplate(id: string) {
    const template = await this.adminRepo.getCvTemplate(id);
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async createCvTemplate(adminId: string, data: unknown) {
    const parsed = createCvTemplateSchema.safeParse(data ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    this.assertValidLatex(parsed.data.latex_source);
    const created = await this.adminRepo.createCvTemplate(parsed.data, adminId);
    await this.adminRepo.writeAuditLog(
      adminId,
      'CV_TEMPLATE_CREATED',
      'cv_template',
      created.id,
    );
    return created;
  }

  async updateCvTemplate(adminId: string, id: string, data: unknown) {
    const parsed = updateCvTemplateSchema.safeParse(data ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    if (parsed.data.latex_source !== undefined) {
      this.assertValidLatex(parsed.data.latex_source);
    }
    const existing = await this.adminRepo.getCvTemplate(id);
    if (!existing) throw new NotFoundException('Template not found');
    const updated = await this.adminRepo.updateCvTemplate(id, parsed.data);
    await this.adminRepo.writeAuditLog(
      adminId,
      'CV_TEMPLATE_UPDATED',
      'cv_template',
      id,
    );
    return updated;
  }

  async deleteCvTemplate(adminId: string, id: string) {
    const existing = await this.adminRepo.getCvTemplate(id);
    if (!existing) throw new NotFoundException('Template not found');
    // generated_cvs references the template with ON DELETE RESTRICT, so a
    // template that produced user PDFs must be deactivated, never dropped.
    const inUse = await this.adminRepo.countGeneratedCvsForTemplate(id);
    if (inUse > 0) {
      throw new BadRequestException(
        `Template is used by ${inUse} generated CV(s) — deactivate it instead`,
      );
    }
    await this.adminRepo.deleteCvTemplate(id);
    await this.adminRepo.writeAuditLog(
      adminId,
      'CV_TEMPLATE_DELETED',
      'cv_template',
      id,
    );
    return { deleted: true };
  }

  // Renders the template with sample data through the real merge pipeline, so an
  // admin can confirm placeholders land correctly before activating. Phase 4
  // compiles this output to PDF inside the sandbox; Phase 6 also renders a live
  // low-res preview image through the exact same sandbox path.
  async previewCvTemplate(adminId: string, data: unknown) {
    const parsed = cvTemplatePreviewSchema.safeParse(data ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    const placeholders = this.assertValidLatex(parsed.data.latex_source);
    const latex = mergeTemplate(
      parsed.data.latex_source,
      CV_TEMPLATE_SAMPLE_DATA,
    );

    // The image is best-effort: the editor stays usable (merged source +
    // placeholders) even when the sandbox is down or the template does not
    // compile, and the client shows an inline note instead of a broken preview.
    // A superseded request is not a failure — let its 409 through so the client
    // discards it. Only generic messages are surfaced, never compiler internals.
    let image: string | null = null;
    let error: string | null = null;
    // Failing line number for the editor's inline marker. Comes from the log
    // summarizer, which returns only a number and a whitelisted message.
    let latexError: LatexFailure | null = null;
    try {
      const result = await this.previews.renderAdminPreview(
        adminId,
        parsed.data.latex_source,
      );
      image = previewDataUrl(result.png);
    } catch (err) {
      if (err instanceof PreviewSupersededException) throw err;
      error =
        err instanceof HttpException ? err.message : 'Live preview failed.';
      latexError = this.latexFailureFrom(err);
      this.logger.warn(
        `Admin template preview failed: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }
    return { placeholders, latex, image, error, latexError };
  }

  /**
   * Pulls the structured compile failure out of a preview exception, if there is
   * one. Returns null for every other failure mode (sandbox down, timeout), where
   * the coarse message is all the admin can be told.
   */
  private latexFailureFrom(err: unknown): LatexFailure | null {
    if (!(err instanceof HttpException)) return null;
    const body = err.getResponse();
    if (!body || typeof body !== 'object' || !('latexError' in body)) {
      return null;
    }
    const candidate = (body as { latexError?: unknown }).latexError;
    if (!candidate || typeof candidate !== 'object') return null;
    const { line, message } = candidate as {
      line?: unknown;
      message?: unknown;
    };
    return {
      ...(typeof line === 'number' ? { line } : {}),
      message: typeof message === 'string' ? message : 'Compile failed.',
    };
  }

  private assertValidLatex(source: string): string[] {
    try {
      return validateTemplateSource(source);
    } catch (error) {
      if (error instanceof LatexTemplateError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
