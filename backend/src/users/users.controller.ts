import {
  Controller,
  Patch,
  Delete,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(
    @Request() req: { user: { id: string } },
    @Body() body: { name?: string; email?: string },
  ) {
    return this.usersService.updateProfile(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password')
  changePassword(
    @Request() req: { user: { id: string } },
    @Body() body: unknown,
  ) {
    return this.usersService.changePassword(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('google')
  unlinkGoogle(@Request() req: { user: { id: string } }) {
    return this.usersService.unlinkGoogle(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  deleteAccount(@Request() req: { user: { id: string } }) {
    return this.usersService.deleteAccount(req.user.id);
  }
}
