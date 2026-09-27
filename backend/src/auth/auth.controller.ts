import { Controller, Post, Body, Get, UseGuards, Request, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    return this.authService.register(body, res);
  }

  @Post('login')
  login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(body, res);
  }

  @Post('refresh')
  refresh(@Request() req: { cookies?: { refreshToken?: string } }, @Res({ passthrough: true }) res: Response) {
    return this.authService.refresh(req.cookies?.refreshToken, res);
  }

  @Post('logout')
  logout(@Request() req: { cookies?: { refreshToken?: string } }, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(req.cookies?.refreshToken, res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req: { user: { id: string; name: string; email: string } }) {
    return req.user;
  }
}
