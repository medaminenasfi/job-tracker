import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CvsController } from './cvs.controller';
import { CvsService } from './cvs.service';
import { CvAiParserService } from './cv-ai-parser';
import { CvRuleParserService } from './cv-rule-parser';

@Module({
  imports: [AiModule],
  controllers: [CvsController],
  providers: [CvsService, CvRuleParserService, CvAiParserService],
})
export class CvsModule {}
