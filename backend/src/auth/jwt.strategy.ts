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
    const result = await this.db.query('SELECT id, name, email FROM users WHERE id = $1', [
      payload.sub,
    ]);
    if (!result.rows[0]) throw new UnauthorizedException();
    return result.rows[0];
  }
}
