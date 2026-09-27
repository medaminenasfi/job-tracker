import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [DbModule, AuthModule, UsersModule, JobsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
