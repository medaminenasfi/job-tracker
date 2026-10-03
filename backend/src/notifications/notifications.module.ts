import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { DbModule } from '../db/db.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DbModule, AuthModule, ScheduleModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
