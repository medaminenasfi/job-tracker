import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private db: DbService, private jwtService: JwtService) {}
  
  async register(data: any) {
    const existing = await this.db.query('SELECT * FROM users WHERE email = $1', [data.email]);
    if (existing.rows.length > 0) throw new ConflictException('Email already exists');
    
    const hash = await bcrypt.hash(data.password, 10);
    const result = await this.db.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [data.name, data.email, hash]
    );
    return this.generateTokens(result.rows[0].id);
  }

  async login(data: any) {
    const result = await this.db.query('SELECT * FROM users WHERE email = $1', [data.email]);
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException('Invalid credentials');
    
    const valid = await bcrypt.compare(data.password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    
    return this.generateTokens(user.id);
  }

  private generateTokens(userId: string) {
    return {
      accessToken: this.jwtService.sign({ sub: userId }, { secret: process.env.JWT_ACCESS_SECRET!, expiresIn: process.env.JWT_ACCESS_EXPIRY as any }),
      refreshToken: this.jwtService.sign({ sub: userId }, { secret: process.env.JWT_REFRESH_SECRET!, expiresIn: process.env.JWT_REFRESH_EXPIRY as any }),
    };
  }
}
