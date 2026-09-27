import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { JobsRepository } from './jobs.repository';
import { DbModule } from '../db/db.module';

@Module({
  imports: [DbModule],
  controllers: [JobsController],
  providers: [JobsService, JobsRepository]
})
export class JobsModule {}
