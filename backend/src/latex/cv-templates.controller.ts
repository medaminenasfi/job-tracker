import { Controller, Get, UseGuards } from '@nestjs/common';
import { LatexBuildService } from './latex-build.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Public catalogue for the CV builder: active templates only, metadata only.
// Template authoring (which includes reading the LaTeX source) stays admin-only.
@UseGuards(JwtAuthGuard)
@Controller('cv-templates')
export class CvTemplatesController {
  constructor(private readonly builds: LatexBuildService) {}

  @Get()
  list() {
    return this.builds.listActiveTemplates();
  }
}
