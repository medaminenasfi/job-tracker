import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AdminService } from './admin.service';
import { ADMIN_REFRESH_COOKIE_NAME } from '../auth/auth.cookies';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TurnstileGuard } from '../auth/turnstile.guard';
import { TurnstileAction } from '../auth/turnstile-action.decorator';

// Public admin auth endpoints. Rate limited far more tightly than the global
// 60/60s guard because these are brute-force / credential-stuffing targets.
// These operate on the separate adminRefreshToken cookie so an admin session
// never clobbers a concurrent user session.
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminService: AdminService) {}

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(TurnstileGuard)
  @TurnstileAction('admin_login')
  @Post('login')
  login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    return this.adminService.login(body, res);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('register')
  register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    return this.adminService.register(body, res);
  }

  @Post('refresh')
  refresh(
    @Request() req: { cookies?: Record<string, string | undefined> },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.adminService.refresh(
      req.cookies?.[ADMIN_REFRESH_COOKIE_NAME],
      res,
    );
  }

  @Post('logout')
  logout(
    @Request() req: { cookies?: Record<string, string | undefined> },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.adminService.logout(
      req.cookies?.[ADMIN_REFRESH_COOKIE_NAME],
      res,
    );
  }

  // Profile for the admin session. Guarded so a demoted/suspended account (or a
  // plain user holding only the user cookie) can never read it.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('me')
  me(@Request() req: { user: unknown }) {
    return req.user;
  }
}
