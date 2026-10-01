import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [AdminController, AdminAuthController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}
