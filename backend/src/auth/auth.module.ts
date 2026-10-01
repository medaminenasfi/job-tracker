import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DbModule } from '../db/db.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { GoogleStrategy } from './google.strategy';
import { GoogleAuthService } from './google-auth.service';
import { TurnstileService } from './turnstile.service';

@Module({
  imports: [DbModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    GoogleStrategy,
    GoogleAuthService,
    TurnstileService,
  ],
  // TurnstileService is exported so AdminModule (which imports AuthModule) can
  // resolve it for the TurnstileGuard on POST /admin/auth/login.
  exports: [JwtAuthGuard, RolesGuard, AuthService, TurnstileService],
})
export class AuthModule {}
