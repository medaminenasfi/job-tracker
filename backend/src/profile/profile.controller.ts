import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  get(@Request() req: { user: { id: string } }) {
    return this.profileService.get(req.user.id);
  }

  @Put()
  upsert(@Request() req: { user: { id: string } }, @Body() body: unknown) {
    return this.profileService.upsert(req.user.id, body);
  }
}
