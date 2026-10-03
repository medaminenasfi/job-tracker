import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { pingRequestSchema, pingResultSchema } from './ai.schemas';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('ping')
  async ping(@Request() req: { user: { id: string } }, @Body() body: any) {
    const parsed = pingRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    await this.aiService.enforceMonthlyCap(req.user.id);
    const result = await this.aiService.completeJson(
      [
        {
          role: 'system',
          content:
            'Reply with strict JSON of the form {"ok": true, "echo": "<the user message>"}.',
        },
        { role: 'user', content: parsed.data.message },
      ],
      pingResultSchema,
    );
    await this.aiService.recordCall(req.user.id);
    return result;
  }
}
