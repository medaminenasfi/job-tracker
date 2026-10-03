import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { JobMatchService } from './job-match.service';
import { DbModule } from '../db/db.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [AiController],
  providers: [AiService, JobMatchService],
  exports: [AiService, JobMatchService],
})
export class AiModule {}
