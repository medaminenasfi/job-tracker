import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Res,
  Req,
  Next,
} from '@nestjs/common';
import type { NextFunction, Request as ExpressRequest, Response } from 'express';
// Default import (not `import * as`): passport's singleton exposes `authenticate`
// on its prototype, which a namespace import's __importStar wrapper would drop.
import passport from 'passport';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthResult, isBlocked } from './google-auth.service';
import { isGoogleConfigured } from './google.config';
import { TurnstileGuard } from './turnstile.guard';
import { TurnstileAction } from './turnstile-action.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Turnstile is verified before any DB lookup / password check (cheap rejection
  // first). Not applied to Google sign-in — Google already vets the user.
  @UseGuards(TurnstileGuard)
  @TurnstileAction('register')
  @Post('register')
  register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    return this.authService.register(body, res);
  }

  @UseGuards(TurnstileGuard)
  @TurnstileAction('login')
  @Post('login')
  login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(body, res);
  }

  @Post('refresh')
  refresh(
    @Request() req: { cookies?: { refreshToken?: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refresh(req.cookies?.refreshToken, res);
  }

  @Post('logout')
  logout(
    @Request() req: { cookies?: { refreshToken?: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(req.cookies?.refreshToken, res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(
    @Request() req: { user: { id: string; name: string; email: string } },
  ) {
    return req.user;
  }

  // ---- Google OAuth (Phase 9) ----
  // Server-side redirect flow. Both hops are gated on isGoogleConfigured() so the
  // app still boots (and returns a clear reason) when credentials are absent.
  // passport is invoked manually rather than via AuthGuard so the not-configured
  // redirect and the blocked/success redirects are all handled in one place
  // without a guard both redirecting and returning false (which would double-send).

  @Get('google')
  googleLogin(
    @Req() req: ExpressRequest,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    if (!isGoogleConfigured()) {
      return res.redirect('/login?error=google_not_configured');
    }
    return passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
    })(req, res, next);
  }

  @Get('google/callback')
  googleCallback(
    @Req() req: ExpressRequest,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    if (!isGoogleConfigured()) {
      return res.redirect('/login?error=google_not_configured');
    }
    return passport.authenticate(
      'google',
      { session: false },
      async (err: unknown, result: GoogleAuthResult | false) => {
        if (err || !result) {
          // Strategy/state failure — a safe, non-leaky reason code.
          return res.redirect('/login?error=google_failed');
        }
        if (isBlocked(result)) {
          return res.redirect(
            `/login?error=${encodeURIComponent(result.blocked)}`,
          );
        }
        // Success: issue the app's own refresh cookie (same as email login) and
        // send the browser to the dashboard. The access token is fetched by the
        // frontend via /api/auth/refresh on mount.
        await this.authService.issueSession(result.id, result.role, res);
        return res.redirect('/dashboard');
      },
    )(req, res, next);
  }
}
