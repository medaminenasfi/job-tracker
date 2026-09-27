import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DbService } from '../db/db.service';

@Module({
  providers: [UsersService, DbService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
