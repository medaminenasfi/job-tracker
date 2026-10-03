import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('summary')
  summary(@Request() req: { user: { id: string } }) {
    return this.service.summary(req.user.id);
  }

  @Get('by-source')
  bySource(@Request() req: { user: { id: string } }) {
    return this.service.bySource(req.user.id);
  }

  @Get('timeline')
  timeline(
    @Request() req: { user: { id: string } },
    @Query('range') range = '30d',
  ) {
    return this.service.timeline(req.user.id, range);
  }
}
