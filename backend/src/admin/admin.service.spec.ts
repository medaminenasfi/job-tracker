jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';
import { AuthService } from '../auth/auth.service';
import { ADMIN_COOKIE } from '../auth/auth.cookies';

describe('AdminService', () => {
  let repo: jest.Mocked<
    Pick<
      AdminRepository,
      | 'getUser'
      | 'countAdmins'
      | 'updateUserStatus'
      | 'updateUserRole'
      | 'deleteUser'
      | 'deleteJob'
      | 'getJob'
      | 'writeAuditLog'
      | 'consumeInvite'
      | 'createInvite'
    >
  >;
  let auth: jest.Mocked<
    Pick<
      AuthService,
      'verifyCredentials' | 'createUser' | 'issueSession' | 'refresh' | 'logout'
    >
  >;
  let service: AdminService;

  beforeEach(() => {
    repo = {
      getUser: jest.fn(),
      countAdmins: jest.fn(),
      updateUserStatus: jest
        .fn()
        .mockResolvedValue({ id: 'u2', account_status: 'SUSPENDED' }),
      updateUserRole: jest.fn().mockResolvedValue({ id: 'u2', role: 'USER' }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      deleteJob: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn(),
      writeAuditLog: jest.fn().mockResolvedValue(undefined),
      consumeInvite: jest.fn(),
      createInvite: jest.fn(),
    };
    auth = {
      verifyCredentials: jest.fn(),
      createUser: jest.fn(),
      issueSession: jest.fn().mockResolvedValue({ accessToken: 'tok' }),
      refresh: jest.fn().mockResolvedValue({ accessToken: 'refreshed' }),
      logout: jest.fn().mockResolvedValue({ message: 'Logged out' }),
    };
    service = new AdminService(
      repo as unknown as AdminRepository,
      auth as unknown as AuthService,
    );
  });

  describe('login', () => {
    it('issues a session for an active ADMIN', async () => {
      auth.verifyCredentials.mockResolvedValue({
        id: 'a1',
        role: 'ADMIN',
        account_status: 'ACTIVE',
      });
      const result = await service.login({
        email: 'a@x.com',
        password: 'secret1',
      });
      expect(result.accessToken).toBe('tok');
      expect(auth.issueSession).toHaveBeenCalledWith(
        'a1',
        'ADMIN',
        undefined,
        ADMIN_COOKIE,
      );
    });

    it('rejects a non-admin with 403', async () => {
      auth.verifyCredentials.mockResolvedValue({
        id: 'u1',
        role: 'USER',
        account_status: 'ACTIVE',
      });
      await expect(
        service.login({ email: 'u@x.com', password: 'secret1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(auth.issueSession).not.toHaveBeenCalled();
    });

    it('rejects a suspended admin', async () => {
      auth.verifyCredentials.mockResolvedValue({
        id: 'a1',
        role: 'ADMIN',
        account_status: 'SUSPENDED',
      });
      await expect(
        service.login({ email: 'a@x.com', password: 'secret1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an invalid payload without hitting the DB', async () => {
      await expect(
        service.login({ email: 'not-an-email', password: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auth.verifyCredentials).not.toHaveBeenCalled();
    });
  });

  describe('register (invite only)', () => {
    it('creates an ADMIN when the invite token is valid', async () => {
      repo.consumeInvite.mockResolvedValue('invite-1');
      auth.createUser.mockResolvedValue('a2');
      const result = await service.register({
        name: 'A',
        email: 'a@x.com',
        password: 'secret1',
        token: 'raw',
      });
      expect(repo.consumeInvite).toHaveBeenCalledWith('raw');
      expect(auth.createUser).toHaveBeenCalledWith(
        'A',
        'a@x.com',
        'secret1',
        'ADMIN',
      );
      expect(result.accessToken).toBe('tok');
    });

    it('rejects an invalid/expired/used invite', async () => {
      repo.consumeInvite.mockResolvedValue(null);
      await expect(
        service.register({
          name: 'A',
          email: 'a@x.com',
          password: 'secret1',
          token: 'bad',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auth.createUser).not.toHaveBeenCalled();
    });
  });

  describe('admin session (independent cookie)', () => {
    const res = {} as never;

    it('refresh delegates to AuthService with the ADMIN cookie', async () => {
      const result = await service.refresh('admin-refresh', res);
      expect(auth.refresh).toHaveBeenCalledWith(
        'admin-refresh',
        res,
        ADMIN_COOKIE,
      );
      expect(result.accessToken).toBe('refreshed');
    });

    it('logout delegates to AuthService with the ADMIN cookie', async () => {
      const result = await service.logout('admin-refresh', res);
      expect(auth.logout).toHaveBeenCalledWith(
        'admin-refresh',
        res,
        ADMIN_COOKIE,
      );
      expect(result).toEqual({ message: 'Logged out' });
    });
  });

  describe('updateUserStatus', () => {
    it('suspends another user and writes an audit log', async () => {
      repo.getUser.mockResolvedValue({ id: 'u2', role: 'USER' });
      await service.updateUserStatus('a1', 'u2', { status: 'SUSPENDED' });
      expect(repo.updateUserStatus).toHaveBeenCalledWith('u2', 'SUSPENDED');
      expect(repo.writeAuditLog).toHaveBeenCalledWith(
        'a1',
        'USER_SUSPENDED',
        'user',
        'u2',
      );
    });

    it('refuses to suspend the acting admin themselves', async () => {
      await expect(
        service.updateUserStatus('a1', 'a1', { status: 'SUSPENDED' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.updateUserStatus).not.toHaveBeenCalled();
    });

    it('throws 404 for an unknown user', async () => {
      repo.getUser.mockResolvedValue(null);
      await expect(
        service.updateUserStatus('a1', 'ghost', { status: 'SUSPENDED' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an invalid status', async () => {
      await expect(
        service.updateUserStatus('a1', 'u2', { status: 'BANNED' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateUserRole', () => {
    it('refuses to demote the acting admin themselves', async () => {
      await expect(
        service.updateUserRole('a1', 'a1', { role: 'USER' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.updateUserRole).not.toHaveBeenCalled();
    });

    it('refuses to demote the last remaining admin', async () => {
      repo.getUser.mockResolvedValue({ id: 'a2', role: 'ADMIN' });
      repo.countAdmins.mockResolvedValue(1);
      await expect(
        service.updateUserRole('a1', 'a2', { role: 'USER' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.updateUserRole).not.toHaveBeenCalled();
    });

    it('demotes an admin when another admin remains and logs it', async () => {
      repo.getUser.mockResolvedValue({ id: 'a2', role: 'ADMIN' });
      repo.countAdmins.mockResolvedValue(2);
      await service.updateUserRole('a1', 'a2', { role: 'USER' });
      expect(repo.updateUserRole).toHaveBeenCalledWith('a2', 'USER');
      expect(repo.writeAuditLog).toHaveBeenCalledWith(
        'a1',
        'USER_DEMOTED',
        'user',
        'a2',
      );
    });

    it('promotes a user to admin and logs it', async () => {
      repo.getUser.mockResolvedValue({ id: 'u2', role: 'USER' });
      await service.updateUserRole('a1', 'u2', { role: 'ADMIN' });
      expect(repo.writeAuditLog).toHaveBeenCalledWith(
        'a1',
        'USER_PROMOTED',
        'user',
        'u2',
      );
    });
  });

  describe('deleteUser', () => {
    it('refuses to delete the acting admin themselves', async () => {
      await expect(service.deleteUser('a1', 'a1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.deleteUser).not.toHaveBeenCalled();
    });

    it('refuses to delete the last remaining admin', async () => {
      repo.getUser.mockResolvedValue({ id: 'a2', role: 'ADMIN' });
      repo.countAdmins.mockResolvedValue(1);
      await expect(service.deleteUser('a1', 'a2')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.deleteUser).not.toHaveBeenCalled();
    });

    it('deletes another user and logs it', async () => {
      repo.getUser.mockResolvedValue({ id: 'u2', role: 'USER' });
      await service.deleteUser('a1', 'u2');
      expect(repo.deleteUser).toHaveBeenCalledWith('u2');
      expect(repo.writeAuditLog).toHaveBeenCalledWith(
        'a1',
        'USER_DELETED',
        'user',
        'u2',
      );
    });
  });

  describe('deleteJob', () => {
    it('deletes an existing job and logs it', async () => {
      repo.getJob.mockResolvedValue({ id: 'j1' });
      await service.deleteJob('a1', 'j1');
      expect(repo.deleteJob).toHaveBeenCalledWith('j1');
      expect(repo.writeAuditLog).toHaveBeenCalledWith(
        'a1',
        'JOB_DELETED',
        'job',
        'j1',
      );
    });

    it('throws 404 for an unknown job', async () => {
      repo.getJob.mockResolvedValue(null);
      await expect(service.deleteJob('a1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.deleteJob).not.toHaveBeenCalled();
    });
  });

  describe('createInvite', () => {
    it('returns the raw token once and never the hash', async () => {
      repo.createInvite.mockResolvedValue('raw-token');
      const result = await service.createInvite('a1', {});
      expect(result.token).toBe('raw-token');
      expect(repo.createInvite).toHaveBeenCalledWith('a1', expect.any(Date));
    });
  });

  describe('createUser (admin-only)', () => {
    it('creates a USER, logs USER_CREATED, and returns the safe row', async () => {
      auth.createUser.mockResolvedValue('u9');
      repo.getUser.mockResolvedValue({
        id: 'u9',
        role: 'USER',
        email: 'u@x.com',
      });
      const result = await service.createUser('a1', {
        name: 'U',
        email: 'u@x.com',
        password: 'secret1',
        role: 'USER',
      });
      expect(auth.createUser).toHaveBeenCalledWith(
        'U',
        'u@x.com',
        'secret1',
        'USER',
      );
      expect(repo.writeAuditLog).toHaveBeenCalledWith(
        'a1',
        'USER_CREATED',
        'user',
        'u9',
      );
      expect(result).toEqual({ id: 'u9', role: 'USER', email: 'u@x.com' });
    });

    it('creates an ADMIN and logs ADMIN_CREATED', async () => {
      auth.createUser.mockResolvedValue('a9');
      repo.getUser.mockResolvedValue({ id: 'a9', role: 'ADMIN' });
      await service.createUser('a1', {
        name: 'A',
        email: 'a@x.com',
        password: 'secret1',
        role: 'ADMIN',
      });
      expect(auth.createUser).toHaveBeenCalledWith(
        'A',
        'a@x.com',
        'secret1',
        'ADMIN',
      );
      expect(repo.writeAuditLog).toHaveBeenCalledWith(
        'a1',
        'ADMIN_CREATED',
        'user',
        'a9',
      );
    });

    it('rejects an invalid role without hitting the DB', async () => {
      await expect(
        service.createUser('a1', {
          name: 'A',
          email: 'a@x.com',
          password: 'secret1',
          role: 'SUPERUSER',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auth.createUser).not.toHaveBeenCalled();
    });

    it('rejects a short password without hitting the DB', async () => {
      await expect(
        service.createUser('a1', {
          name: 'A',
          email: 'a@x.com',
          password: 'x',
          role: 'USER',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auth.createUser).not.toHaveBeenCalled();
    });
  });
});
