jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let query: jest.Mock;
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'access-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';
    query = jest.fn();
    jwtService = {
      sign: jest.fn().mockReturnValue('signed-token'),
      verify: jest.fn().mockReturnValue({ sub: 'user-1' }),
    };
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
    service = new AuthService(
      { query } as never,
      jwtService as unknown as JwtService,
    );
  });

  it('registers a user and sets a refresh cookie', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.register(
      { name: 'Ada', email: 'ada@example.com', password: 'secret1' },
      res as never,
    );

    expect(result.accessToken).toBe('signed-token');
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'signed-token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
    const insertUserArgs = query.mock.calls[1];
    expect(insertUserArgs[1][0]).toBe('Ada');
    expect(insertUserArgs[1][1]).toBe('ada@example.com');
    expect(await bcrypt.compare('secret1', insertUserArgs[1][2])).toBe(true);
  });

  it('rejects duplicate emails', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    await expect(
      service.register({
        name: 'Ada',
        email: 'ada@example.com',
        password: 'secret1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects invalid register payloads', async () => {
    await expect(
      service.register({
        name: 'Ada',
        email: 'not-an-email',
        password: 'secret1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown login emails', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(
      service.login({ email: 'ada@example.com', password: 'secret1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects wrong passwords', async () => {
    const password_hash = await bcrypt.hash('secret1', 10);
    query.mockResolvedValueOnce({ rows: [{ id: 'user-1', password_hash }] });
    await expect(
      service.login({ email: 'ada@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs in and returns an access token', async () => {
    const password_hash = await bcrypt.hash('secret1', 10);
    query
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', password_hash }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.login(
      { email: 'ada@example.com', password: 'secret1' },
      res as never,
    );
    expect(result.accessToken).toBe('signed-token');
  });

  it('refuses refresh without a token', async () => {
    await expect(
      service.refresh(undefined, res as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses refresh when the token is not stored', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(
      service.refresh('refresh-token', res as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes the refresh token on logout', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const result = await service.logout('refresh-token', res as never);
    expect(result).toEqual({ message: 'Logged out' });
    expect(query).toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refreshToken',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  it('writes the separate admin cookie when issued with ADMIN_COOKIE', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await service.issueSession('admin-1', 'ADMIN', res as never, {
      name: 'adminRefreshToken',
    });
    expect(res.cookie).toHaveBeenCalledWith(
      'adminRefreshToken',
      'signed-token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  it('clears only the admin cookie on admin logout', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await service.logout('admin-refresh', res as never, {
      name: 'adminRefreshToken',
    });
    expect(res.clearCookie).toHaveBeenCalledWith(
      'adminRefreshToken',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
    expect(res.clearCookie).not.toHaveBeenCalledWith(
      'refreshToken',
      expect.anything(),
    );
  });
});
