import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminService } from './admin.service';

// Class-level guards: every route below requires a valid token AND the ADMIN
// role. req.user is populated by JwtStrategy (role re-read from the DB each
// request), so a demoted admin's old token is rejected here.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private adminId(req: { user: { id: string } }) {
    return req.user.id;
  }

  @Post('invites')
  createInvite(
    @Request() req: { user: { id: string } },
    @Body() body: unknown,
  ) {
    return this.adminService.createInvite(this.adminId(req), body);
  }

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Post('users')
  createUser(@Request() req: { user: { id: string } }, @Body() body: unknown) {
    return this.adminService.createUser(this.adminId(req), body);
  }

  @Get('users')
  listUsers(@Query() query: unknown) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.adminService.updateUserStatus(this.adminId(req), id, body);
  }

  @Patch('users/:id/role')
  updateUserRole(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.adminService.updateUserRole(this.adminId(req), id, body);
  }

  @Delete('users/:id')
  deleteUser(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.adminService.deleteUser(this.adminId(req), id);
  }

  @Get('jobs')
  listJobs(@Query() query: unknown) {
    return this.adminService.listJobs(query);
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.adminService.getJob(id);
  }

  @Delete('jobs/:id')
  deleteJob(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.adminService.deleteJob(this.adminId(req), id);
  }

  @Get('audit-logs')
  listAuditLogs(@Query() query: unknown) {
    return this.adminService.listAuditLogs(query);
  }

  // CV templates are written by admins only — no user-facing endpoint ever
  // accepts latex_source.
  @Get('cv-templates/placeholders')
  getCvTemplatePlaceholders() {
    return this.adminService.getCvTemplatePlaceholders();
  }

  @Get('cv-templates')
  listCvTemplates(@Query() query: unknown) {
    return this.adminService.listCvTemplates(query);
  }

  @Get('cv-templates/:id')
  getCvTemplate(@Param('id') id: string) {
    return this.adminService.getCvTemplate(id);
  }

  @Post('cv-templates')
  createCvTemplate(
    @Request() req: { user: { id: string } },
    @Body() body: unknown,
  ) {
    return this.adminService.createCvTemplate(this.adminId(req), body);
  }

  @Patch('cv-templates/:id')
  updateCvTemplate(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.adminService.updateCvTemplate(this.adminId(req), id, body);
  }

  @Delete('cv-templates/:id')
  deleteCvTemplate(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.adminService.deleteCvTemplate(this.adminId(req), id);
  }

  // Live preview compiles in the sandbox on every editor pause, so it gets the
  // same generous, separate budget as the user build-preview endpoint.
  @Post('cv-templates/preview')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  previewCvTemplate(
    @Request() req: { user: { id: string } },
    @Body() body: unknown,
  ) {
    return this.adminService.previewCvTemplate(this.adminId(req), body);
  }
}
