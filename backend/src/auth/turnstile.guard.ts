import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TurnstileService } from './turnstile.service';
import { TURNSTILE_ACTION_KEY } from './turnstile-action.decorator';

// Verifies the Cloudflare Turnstile token on public auth routes BEFORE any
// password check or database lookup (cheap rejection first). The token is read
// from `turnstileToken` in the request body; the expected action comes from the
// @TurnstileAction decorator. Fails closed: an unavailable CAPTCHA service yields
// 503, an invalid/mismatched token yields a generic 400 that never reveals
// whether the email exists.
@Injectable()
export class TurnstileGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly turnstile: TurnstileService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<string | undefined>(
      TURNSTILE_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    const req = context
      .switchToHttp()
      .getRequest<Request & { body?: { turnstileToken?: string } }>();

    const result = await this.turnstile.verify(
      req.body?.turnstileToken,
      this.clientIp(req),
      action,
    );
    if (result.success) return true;

    if (result.status === 503) {
      throw new ServiceUnavailableException(
        'CAPTCHA verification unavailable, please try again',
      );
    }
    throw new BadRequestException('CAPTCHA verification failed');
  }

  // Best-effort client IP. `remoteip` is optional for Cloudflare; behind the Next
  // proxy the first x-forwarded-for hop is the real client when present, else the
  // socket address. Never required for verification to succeed.
  private clientIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() || undefined;
    }
    return req.ip || undefined;
  }
}
