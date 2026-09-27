import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { loginSchema, registerSchema } from './auth.schemas';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './auth.cookies';

@Injectable()
export class AuthService {
  constructor(
    private db: DbService,
    private jwtService: JwtService,
  ) {}

  async register(data: unknown, res?: Response) {
    const parsed = registerSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    const { name, email, password } = parsed.data;

    const existing = await this.db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) throw new ConflictException('Email already exists');

    const hash = await bcrypt.hash(password, 10);
    const result = await this.db.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [name, email, hash],
    );
    const tokens = this.generateTokens(result.rows[0].id);
    await this.storeRefreshToken(result.rows[0].id, tokens.refreshToken);
    if (res) this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  async login(data: unknown, res?: Response) {
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    const { email, password } = parsed.data;

    const result = await this.db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const tokens = this.generateTokens(user.id);
    await this.storeRefreshToken(user.id, tokens.refreshToken);
    if (res) this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) throw new UnauthorizedException('No refresh token');
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.requireSecret('JWT_REFRESH_SECRET'),
      });
      const hash = this.hashToken(refreshToken);
      const stored = await this.db.query(
        'SELECT id FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > now()',
        [payload.sub, hash],
      );
      if (stored.rows.length === 0) throw new UnauthorizedException('Invalid refresh token');

      await this.db.query('DELETE FROM refresh_tokens WHERE id = $1', [stored.rows[0].id]);
      const tokens = this.generateTokens(payload.sub);
      await this.storeRefreshToken(payload.sub, tokens.refreshToken);
      this.setRefreshCookie(res, tokens.refreshToken);
      return { accessToken: tokens.accessToken };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(refreshToken: string | undefined, res: Response) {
    if (refreshToken) {
      await this.db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [
        this.hashToken(refreshToken),
      ]);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
    return { message: 'Logged out' };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
  }

  private async storeRefreshToken(userId: string, token: string) {
    await this.db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval \'7 days\')',
      [userId, this.hashToken(token)],
    );
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private requireSecret(name: string) {
    const value = process.env[name];
    if (!value) throw new InternalServerErrorException(`${name} is not configured`);
    return value;
  }

  private generateTokens(userId: string) {
    return {
      accessToken: this.jwtService.sign(
        { sub: userId },
        {
          secret: this.requireSecret('JWT_ACCESS_SECRET'),
          expiresIn: (process.env.JWT_ACCESS_EXPIRY ?? '15m') as never,
        },
      ),
      refreshToken: this.jwtService.sign(
        { sub: userId },
        {
          secret: this.requireSecret('JWT_REFRESH_SECRET'),
          expiresIn: (process.env.JWT_REFRESH_EXPIRY ?? '7d') as never,
        },
      ),
    };
  }
}
