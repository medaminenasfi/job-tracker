import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { Response } from 'express';
import { LatexBuildService } from './latex-build.service';
import { LatexPreviewService, previewDataUrl } from './latex-preview.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('cvs/build')
export class LatexBuildController {
  constructor(
    private readonly builds: LatexBuildService,
    private readonly previews: LatexPreviewService,
  ) {}

  // Compiling is container/CPU-expensive, so it gets its own budget, separate
  // from the AI-call cap.
  @Post()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  create(@Request() req: { user: { id: string } }, @Body() body: unknown) {
    return this.builds.create(req.user.id, body);
  }

  // Live split-view preview (Phase 6): same escape → merge → sandbox flow as a
  // final build, but ephemeral and rate-limited far more generously because it
  // fires on every typing pause. A newer request supersedes an in-flight one
  // (409), which the client discards.
  @Post('preview')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async preview(
    @Request() req: { user: { id: string } },
    @Body() body: unknown,
  ) {
    const result = await this.previews.renderUserBuild(req.user.id, body);
    return { image: previewDataUrl(result.png), cached: result.cached };
  }

  @Get(':id')
  findOne(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.builds.findOne(req.user.id, id);
  }

  @Delete(':id')
  remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.builds.remove(req.user.id, id);
  }

  @Get(':id/file')
  async download(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    // Ownership-checked: another user's build id is a 404, never a download.
    const build = await this.builds.findOne(req.user.id, id);
    const filePath = join(this.builds.storageDir, `${id}.pdf`);
    if (build.status !== 'ready' || !existsSync(filePath)) {
      res.status(404).json({ message: 'PDF not ready' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cv-${id}.pdf"`);
    createReadStream(filePath).pipe(res);
  }
}
