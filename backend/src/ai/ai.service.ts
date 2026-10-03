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
    // Free-tier models are rate-limited upstream: retry 429/5xx with
    // backoff before giving up so a busy slot doesn't fail the match.
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
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        this.logger.warn(
          `AI provider request failed: ${(err as Error).message}`,
        );
        throw new ServiceUnavailableException('AI request failed');
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= 2) break;
      this.logger.warn(
        `AI provider ${res.status}, retrying (${attempt + 1}/2)`,
      );
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
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
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
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
}
