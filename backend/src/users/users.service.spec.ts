import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let query: jest.Mock;
  let service: UsersService;

  beforeEach(() => {
    query = jest.fn();
    service = new UsersService({ query } as never);
  });

  describe('changePassword', () => {
    it('updates the hash when the current password matches', async () => {
      const hash = await bcrypt.hash('oldpass1', 10);
      query
        .mockResolvedValueOnce({ rows: [{ password_hash: hash }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.changePassword('u1', {
        currentPassword: 'oldpass1',
        newPassword: 'newpass1',
      });

      expect(result).toEqual({ updated: true });
      const updateCall = query.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE users SET password_hash');
      // The stored hash must be a bcrypt hash of the NEW password, not the raw value.
      expect(await bcrypt.compare('newpass1', updateCall[1][0])).toBe(true);
    });

    it('rejects a wrong current password without updating', async () => {
      const hash = await bcrypt.hash('oldpass1', 10);
      query.mockResolvedValueOnce({ rows: [{ password_hash: hash }] });

      await expect(
        service.changePassword('u1', {
          currentPassword: 'wrongpass',
          newPassword: 'newpass1',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('rejects a too-short new password before touching the DB', async () => {
      await expect(
        service.changePassword('u1', {
          currentPassword: 'oldpass1',
          newPassword: '123',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('lets a Google-only account (null hash) set a first password with no current', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ password_hash: null }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.changePassword('u1', {
        newPassword: 'firstpass1',
      });

      expect(result).toEqual({ updated: true });
      const updateCall = query.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE users SET password_hash');
      expect(await bcrypt.compare('firstpass1', updateCall[1][0])).toBe(true);
    });

    it('requires a current password when the account already has one', async () => {
      const hash = await bcrypt.hash('oldpass1', 10);
      query.mockResolvedValueOnce({ rows: [{ password_hash: hash }] });

      await expect(
        service.changePassword('u1', { newPassword: 'newpass1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe('unlinkGoogle', () => {
    it('clears google_id when the account has a password', async () => {
      query
        .mockResolvedValueOnce({
          rows: [{ google_id: 'g1', password_hash: 'somehash' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.unlinkGoogle('u1');

      expect(result).toEqual({ unlinked: true });
      expect(query.mock.calls[1][0]).toContain('SET google_id = NULL');
    });

    it('refuses when Google is not connected', async () => {
      query.mockResolvedValueOnce({
        rows: [{ google_id: null, password_hash: 'somehash' }],
      });

      await expect(service.unlinkGoogle('u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('refuses when unlinking would leave no way to sign in (no password)', async () => {
      query.mockResolvedValueOnce({
        rows: [{ google_id: 'g1', password_hash: null }],
      });

      await expect(service.unlinkGoogle('u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteAccount', () => {
    it('deletes the user row', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const result = await service.deleteAccount('u1');
      expect(result).toEqual({ deleted: true });
      expect(query.mock.calls[0][0]).toContain('DELETE FROM users WHERE id');
      expect(query.mock.calls[0][1]).toEqual(['u1']);
    });
  });

  describe('custom statuses', () => {
    it('creates a custom status after checking duplicate names', async () => {
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ position: 7 }] })
        .mockResolvedValueOnce({ rows: [{ id: 's1', name: 'Phone screen' }] });

      await expect(
        service.createStatus('u1', { name: 'Phone screen' }),
      ).resolves.toEqual({
        id: 's1',
        name: 'Phone screen',
      });
      expect(query.mock.calls[2][0]).toContain('INSERT INTO job_statuses');
    });

    it('moves jobs to the next status before deleting a status', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ name: 'Phone screen' }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Saved' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] });

      await expect(service.deleteStatus('u1', 's1')).resolves.toEqual({
        deleted: true,
      });
      expect(query.mock.calls[2][0]).toContain('UPDATE jobs SET status');
    });
  });
});
