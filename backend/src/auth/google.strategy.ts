import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { GoogleAuthService, GoogleAuthResult } from './google-auth.service';
import { CookieStateStore } from './google-state.store';
import {
  googleClientId,
  googleClientSecret,
  googleCallbackUrl,
} from './google.config';

// Passport strategy for the server-side Google redirect flow. The client
// id/secret fall back to placeholders when unset so the module still constructs
// (the OAuth routes are separately gated by isGoogleConfigured()).
//
// `state` + a cookie-backed `store` give OAuth CSRF protection without requiring
// express-session. validate() resolves the local user (or a blocked reason) that
// becomes req.user in the callback handler.
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly googleAuthService: GoogleAuthService) {
    // `state` + a cookie-backed `store` are passport-oauth2 options that the
    // @types/passport-google-oauth20 StrategyOptions does not declare, so the
    // options object is asserted to the strategy's constructor parameter type.
    const options = {
      clientID: googleClientId(),
      clientSecret: googleClientSecret(),
      callbackURL: googleCallbackUrl(),
      scope: ['profile', 'email'],
      state: true,
      store: new CookieStateStore(),
    };
    super(options as ConstructorParameters<typeof Strategy>[0]);
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<GoogleAuthResult> {
    return this.googleAuthService.handleGoogleUser(profile);
  }
}
