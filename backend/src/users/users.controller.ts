import { Controller, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Request() req: { user: { id: string } }, @Body() body: { name?: string; email?: string }) {
    return this.usersService.updateProfile(req.user.id, body);
  }
}
