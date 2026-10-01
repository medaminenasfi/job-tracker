import { Injectable, Logger } from '@nestjs/common';

// Cloudflare Turnstile server-side verification (Phase 10). The frontend widget
// protects nothing on its own — a bot can call the API directly — so every
// login/register token is verified here. Fail closed: if the secret is missing or
// the siteverify call errors/times out, the request is rejected (503), never waved
// through. See AGENTS.md §13 (security) and §12 (intentional error handling).

export type TurnstileVerifyResult =
  | { success: true }
  | { success: false; status: 400 | 503; detail: string };

interface SiteVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  action?: string;
  hostname?: string;
  challenge_ts?: string;
}

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Turnstile tokens are short-lived and bounded; reject obviously bogus input
// before spending a network call.
const MAX_TOKEN_LENGTH = 2048;
const TIMEOUT_MS = 5000;

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  async verify(
    token: string | undefined,
    ip?: string,
    expectedAction?: string,
  ): Promise<TurnstileVerifyResult> {
    // Cheap rejection first: a missing/oversized token never reaches Cloudflare.
    if (!token || token.length > MAX_TOKEN_LENGTH) {
      return { success: false, status: 400, detail: 'missing-input-response' };
    }

    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      // Fail closed. The secret value is never logged.
      this.logger.error('TURNSTILE_SECRET_KEY is not configured');
      return {
        success: false,
        status: 503,
        detail: 'turnstile-not-configured',
      };
    }

    const body = new URLSearchParams({ secret, response: token });
    // remoteip is optional for Cloudflare; include it best-effort for signal.
    if (ip) body.set('remoteip', ip);

    let data: SiteVerifyResponse;
    try {
      const res = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(
          `siteverify HTTP ${res.status} ip=${ip ?? '-'} action=${expectedAction ?? '-'}`,
        );
        return { success: false, status: 503, detail: 'siteverify-http-error' };
      }
      data = (await res.json()) as SiteVerifyResponse;
    } catch (err) {
      // Timeout or network error → fail closed (503), never let the request pass.
      this.logger.warn(
        `siteverify failed ip=${ip ?? '-'} action=${expectedAction ?? '-'} err=${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      return {
        success: false,
        status: 503,
        detail: 'timeout-or-network-error',
      };
    }

    if (!data || data.success !== true) {
      const codes =
        Array.isArray(data?.['error-codes']) && data['error-codes'].length > 0
          ? data['error-codes'].join(',')
          : 'invalid-input-response';
      // Log Cloudflare error-codes (e.g. timeout-or-duplicate) for monitoring.
      this.logger.warn(
        `turnstile rejected ip=${ip ?? '-'} action=${expectedAction ?? '-'} codes=${codes}`,
      );
      return { success: false, status: 400, detail: codes };
    }

    // A token minted for a different form (action) can't be replayed here. Only
    // enforce when Cloudflare actually returned an action: real widgets always
    // set it, so cross-form replay is still rejected, but the public "always
    // passes" test keys omit it (their dummy token carries no action), which
    // would otherwise reject every legitimate dev login. See AGENTS.md §13.
    if (expectedAction && data.action && data.action !== expectedAction) {
      this.logger.warn(
        `turnstile action mismatch ip=${ip ?? '-'} expected=${expectedAction} got=${data.action ?? '-'}`,
      );
      return { success: false, status: 400, detail: 'action-mismatch' };
    }

    // Optional hostname allow-list (comma-separated) for replay protection.
    const allowedHostnames = (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    if (
      allowedHostnames.length > 0 &&
      data.hostname &&
      !allowedHostnames.includes(data.hostname)
    ) {
      this.logger.warn(
        `turnstile hostname mismatch ip=${ip ?? '-'} host=${data.hostname}`,
      );
      return { success: false, status: 400, detail: 'hostname-mismatch' };
    }

    return { success: true };
  }
}
