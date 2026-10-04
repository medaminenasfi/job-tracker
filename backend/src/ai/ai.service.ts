import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../db/db.service';

const CAP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const backoff = (attempt: number) =>
  new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));

const describeError = (err: unknown) =>
  err instanceof Error ? `${err.name}: ${err.message}` : String(err);

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly db: DbService) {}

  private get apiKey() {
    return process.env.OPENROUTER_API_KEY;
  }

  private get model() {
    return process.env.AI_MODEL ?? 'qwen/qwen3.8-27b:free';
  }

  private get monthlyCap() {
    const cap = Number(process.env.AI_MONTHLY_CALL_CAP);
    return Number.isFinite(cap) && cap > 0 ? cap : 50;
  }

  // Free-tier models can be slow on a large CV, so the timeout is configurable.
  private get timeoutMs() {
    const value = Number(process.env.AI_TIMEOUT_MS);
    return Number.isFinite(value) && value >= 5_000 ? value : 30_000;
  }

  async enforceMonthlyCap(userId: string) {
    const result = await this.db.query(
      `SELECT ai_calls_this_month, ai_calls_reset_at FROM users WHERE id = $1`,
      [userId],
    );
    const row = result.rows[0] as
      | { ai_calls_this_month: number; ai_calls_reset_at: string | null }
      | undefined;
    if (!row) return;
    const resetAt = row.ai_calls_reset_at
      ? new Date(row.ai_calls_reset_at).getTime()
      : 0;
    const expired = !resetAt || Date.now() - resetAt > CAP_WINDOW_MS;
    const used = expired ? 0 : Number(row.ai_calls_this_month);
    if (used >= this.monthlyCap) {
      throw new HttpException(
        'Monthly AI call limit reached. Try again next month.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordCall(userId: string) {
    await this.db.query(
      `UPDATE users
          SET ai_calls_this_month = CASE
                WHEN ai_calls_reset_at IS NULL
                  OR ai_calls_reset_at < now() - interval '30 days'
                THEN 1 ELSE ai_calls_this_month + 1 END,
              ai_calls_reset_at = CASE
                WHEN ai_calls_reset_at IS NULL
                  OR ai_calls_reset_at < now() - interval '30 days'
                THEN now() ELSE ai_calls_reset_at END
        WHERE id = $1`,
      [userId],
    );
    this.logger.log(`AI call recorded for user ${userId}`);
  }

  // The model is untrusted: its output is parsed and Zod-validated before
  // it is stored or returned, and failures never leak the raw provider error.
  async completeJson<S extends z.ZodType>(
    messages: { role: 'system' | 'user'; content: string }[],
    schema: S,
  ): Promise<z.infer<S>> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('AI provider is not configured');
    }
    let res: Response;
    // Free-tier models are rate-limited and slow upstream: retry 429/5xx and
    // transport timeouts with backoff before giving up.
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://jobtracker.local',
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        if (attempt < MAX_ATTEMPTS - 1) {
          this.logger.warn(
            `AI provider request error (${describeError(err)}), retrying (${attempt + 1}/${MAX_ATTEMPTS - 1})`,
          );
          await backoff(attempt);
          continue;
        }
        this.logger.warn(`AI provider request failed: ${describeError(err)}`);
        throw this.providerError(err);
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS - 1) break;
      this.logger.warn(
        `AI provider ${res.status}, retrying (${attempt + 1}/${MAX_ATTEMPTS - 1})`,
      );
      await backoff(attempt);
    }
    if (!res.ok) {
      this.logger.warn(`AI provider returned ${res.status}`);
      if (res.status === 429) {
        throw new HttpException(
          'AI provider is rate limited. Try again in a minute.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new ServiceUnavailableException(
        `AI request failed (provider status ${res.status})`,
      );
    }
    // Reading the body is part of the same abort window: a slow stream aborts
    // here too, so it must be handled exactly like a transport failure.
    let body: { choices?: { message?: { content?: string } }[] };
    try {
      body = (await res.json()) as typeof body;
    } catch (err) {
      this.logger.warn(
        `AI provider response unreadable: ${describeError(err)}`,
      );
      throw this.providerError(err);
    }
    const content = body.choices?.[0]?.message?.content;
    let parsed: unknown;
    try {
      parsed = JSON.parse(content ?? '');
    } catch {
      throw new ServiceUnavailableException('AI returned invalid JSON');
    }
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      throw new ServiceUnavailableException('AI returned unexpected shape');
    }
    return validated.data;
  }

  // A timeout/abort becomes an explicit 504 with actionable wording; anything
  // else is an opaque transport failure. Raw DOMException/AbortError objects
  // must never reach the exception layer.
  private providerError(err: unknown) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return new HttpException(
        'AI provider timed out. Try again in a moment or use rule-based parsing.',
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }
    return new ServiceUnavailableException('AI request failed');
  }
}
