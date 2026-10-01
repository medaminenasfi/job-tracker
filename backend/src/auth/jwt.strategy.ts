import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private db: DbService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'missing-jwt-access-secret',
    });
  }

  async validate(payload: { sub: string }) {
    const result = await this.db.query(
      'SELECT id, name, email, role, account_status, google_id, avatar_url, password_hash FROM users WHERE id = $1',
      [payload.sub],
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException();
    // A suspended account is locked out immediately, even with a still-valid token.
    if (user.account_status === 'SUSPENDED')
      throw new UnauthorizedException('Account suspended');
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      // Derived flags the frontend uses for the Connected-accounts UI. Never send
      // the hash or the raw google_id — only booleans and the public avatar.
      googleConnected: !!user.google_id,
      hasPassword: !!user.password_hash,
      avatarUrl: user.avatar_url ?? null,
    };
  }
}
