import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { DockerEngine } from './docker-engine';
import { LatexCompilerService } from './latex-compiler.service';
import { LatexBuildService } from './latex-build.service';
import { LatexPreviewService } from './latex-preview.service';
import { LatexBuildController } from './latex-build.controller';
import { CvTemplatesController } from './cv-templates.controller';

@Module({
  imports: [DbModule],
  controllers: [LatexBuildController, CvTemplatesController],
  providers: [
    DockerEngine,
    LatexCompilerService,
    LatexBuildService,
    LatexPreviewService,
  ],
  // Exported so AdminModule can render a live template preview through the exact
  // same sandbox path instead of duplicating the compile logic.
  exports: [LatexBuildService, LatexPreviewService],
})
export class LatexModule {}
