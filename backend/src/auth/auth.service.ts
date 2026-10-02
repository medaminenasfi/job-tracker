import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { hashToken } from './token-hash';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.schemas';
import { CookieSpec, USER_COOKIE, refreshCookieOptions } from './auth.cookies';

@Injectable()
export class AuthService {
  constructor(
    private db: DbService,
    private jwtService: JwtService,
  ) {}

  async register(data: unknown, res?: Response) {
    const parsed = registerSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    const { name, email, password } = parsed.data;
    // Public registration always creates a USER — role is never taken from input.
    const id = await this.createUser(name, email, password, 'USER');
    return this.issueSession(id, 'USER', res);
  }

  async login(data: unknown, res?: Response) {
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    const user = await this.verifyCredentials(
      parsed.data.email,
      parsed.data.password,
    );
    if (user.account_status === 'SUSPENDED') {
      throw new UnauthorizedException('Account suspended');
    }
    await this.db.query(
      'UPDATE users SET last_login_at = now() WHERE id = $1',
      [user.id],
    );
    return this.issueSession(user.id, user.role ?? 'USER', res);
  }

  async forgotPassword(data: unknown) {
    const parsed = forgotPasswordSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    const { email } = parsed.data;
    const userResult = await this.db.query(
      'SELECT id, email, account_status FROM users WHERE email = $1',
      [email],
    );
    const user = userResult.rows[0];

    // Always return success even if user not found to prevent user enumeration
    if (!user || user.account_status === 'SUSPENDED') {
      return {
        message:
          'If that email is registered, password reset instructions have been generated.',
      };
    }

    // Invalidate existing active tokens for this user
    await this.db.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1',
      [user.id],
    );

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    await this.db.query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')",
      [user.id, tokenHash],
    );

    return {
      message:
        'If that email is registered, password reset instructions have been generated.',
      // In development or when email service is absent, provide the resetToken for convenient testing
      resetToken: process.env.NODE_ENV !== 'production' ? rawToken : undefined,
    };
  }

  async resetPassword(data: unknown) {
    const parsed = resetPasswordSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid input',
      );
    }
    const { token, password } = parsed.data;
    const tokenHash = this.hashToken(token);

    const tokenResult = await this.db.query(
      'SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()',
      [tokenHash],
    );
    const resetRecord = tokenResult.rows[0];
    if (!resetRecord) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Update user password and mark token as used
    await this.db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      passwordHash,
      resetRecord.user_id,
    ]);
    await this.db.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE id = $1',
      [resetRecord.id],
    );

    // Invalidate all active refresh tokens for this user
    await this.db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [
      resetRecord.user_id,
    ]);

    return {
      message: 'Password has been successfully reset. You can now log in.',
    };
  }

  // Shared credential check reused by /auth/login and /admin/auth/login so the
  // bcrypt comparison and user lookup live in exactly one place.
  async verifyCredentials(email: string, password: string) {
    const result = await this.db.query('SELECT * FROM users WHERE email = $1', [
      email,
    ]);
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException('Invalid credentials');
    // Google-only accounts have no password_hash; password login is impossible for
    // them. Fail closed with the same generic message (no account enumeration).
    if (!user.password_hash)
      throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  // Shared user creation reused by public register and admin invite register.
  async createUser(
    name: string,
    email: string,
    password: string,
    role: 'USER' | 'ADMIN',
  ) {
    const existing = await this.db.query(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    if (existing.rows.length > 0)
      throw new ConflictException('Email already exists');
    const hash = await bcrypt.hash(password, 10);
    const result = await this.db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email, hash, role],
    );
    return result.rows[0].id as string;
  }

  // Issues access+refresh tokens, persists the refresh hash, and sets the cookie.
  // The `cookie` spec selects which refresh cookie is written so the user and
  // admin sessions stay independent.
  async issueSession(
    userId: string,
    role: string,
    res?: Response,
    cookie: CookieSpec = USER_COOKIE,
  ) {
    const tokens = this.generateTokens(userId, role);
    await this.storeRefreshToken(userId, tokens.refreshToken);
    if (res) this.setRefreshCookie(res, tokens.refreshToken, cookie);
    return { accessToken: tokens.accessToken };
  }

  async refresh(
    refreshToken: string | undefined,
    res: Response,
    cookie: CookieSpec = USER_COOKIE,
  ) {
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
      if (stored.rows.length === 0)
        throw new UnauthorizedException('Invalid refresh token');

      // Re-read the user so a suspension or role change takes effect on refresh
      // instead of being carried forward from the old token.
      const userRes = await this.db.query(
        'SELECT role, account_status FROM users WHERE id = $1',
        [payload.sub],
      );
      const user = userRes.rows[0];
      if (!user) throw new UnauthorizedException('Invalid refresh token');
      if (user.account_status === 'SUSPENDED')
        throw new UnauthorizedException('Account suspended');

      await this.db.query('DELETE FROM refresh_tokens WHERE id = $1', [
        stored.rows[0].id,
      ]);
      const tokens = this.generateTokens(payload.sub, user.role ?? 'USER');
      await this.storeRefreshToken(payload.sub, tokens.refreshToken);
      this.setRefreshCookie(res, tokens.refreshToken, cookie);
      return { accessToken: tokens.accessToken };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(
    refreshToken: string | undefined,
    res: Response,
    cookie: CookieSpec = USER_COOKIE,
  ) {
    if (refreshToken) {
      await this.db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [
        this.hashToken(refreshToken),
      ]);
    }
    res.clearCookie(cookie.name, refreshCookieOptions());
    return { message: 'Logged out' };
  }

  private setRefreshCookie(res: Response, token: string, cookie: CookieSpec) {
    res.cookie(cookie.name, token, refreshCookieOptions());
  }

  private async storeRefreshToken(userId: string, token: string) {
    await this.db.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '7 days')",
      [userId, this.hashToken(token)],
    );
  }

  private hashToken(token: string) {
    return hashToken(token);
  }

  private requireSecret(name: string) {
    const value = process.env[name];
    if (!value)
      throw new InternalServerErrorException(`${name} is not configured`);
    return value;
  }

  private generateTokens(userId: string, role: string) {
    return {
      accessToken: this.jwtService.sign(
        { sub: userId, role },
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
