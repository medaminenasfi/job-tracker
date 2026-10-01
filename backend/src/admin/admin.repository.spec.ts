import { AdminRepository } from './admin.repository';
import { hashToken } from '../auth/token-hash';

describe('AdminRepository', () => {
  let query: jest.Mock;
  let repo: AdminRepository;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue({ rows: [{ count: 0 }] });
    repo = new AdminRepository({ query } as never);
  });

  describe('listUsers', () => {
    it('binds search/role/status filters and pagination in order', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ count: 3 }] }) // COUNT
        .mockResolvedValueOnce({ rows: [{ id: 'u1' }] }); // page
      await repo.listUsers({
        page: 2,
        limit: 10,
        search: 'ada',
        role: 'USER',
        status: 'ACTIVE',
      });

      const [countSql, countVals] = query.mock.calls[0];
      expect(countSql).toContain('(name ILIKE $1 OR email ILIKE $1)');
      expect(countSql).toContain('role = $2');
      expect(countSql).toContain('account_status = $3');
      expect(countVals).toEqual(['%ada%', 'USER', 'ACTIVE']);

      const [listSql, listVals] = query.mock.calls[1];
      // 3 filters ($1..$3) then LIMIT $4 OFFSET $5
      expect(listSql).toContain('LIMIT $4 OFFSET $5');
      expect(listVals).toEqual(['%ada%', 'USER', 'ACTIVE', 10, 10]); // offset = (2-1)*10
    });

    it('returns all users with no filters and default offset 0', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [] });
      await repo.listUsers({ page: 1, limit: 20 });
      const [countSql] = query.mock.calls[0];
      expect(countSql).not.toContain('WHERE');
      const [, listVals] = query.mock.calls[1];
      expect(listVals).toEqual([20, 0]);
    });
  });

  describe('listJobs (cross-user)', () => {
    it('filters by user_id/status/source without scoping to the caller', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ count: 2 }] })
        .mockResolvedValueOnce({ rows: [] });
      await repo.listJobs({
        page: 1,
        limit: 20,
        user_id: 'u1',
        status: 'APPLIED',
        source: 'linkedin',
      });
      const [countSql, countVals] = query.mock.calls[0];
      expect(countSql).toContain('j.user_id = $1');
      expect(countSql).toContain('j.status = $2');
      expect(countSql).toContain('j.source = $3');
      expect(countVals).toEqual(['u1', 'APPLIED', 'linkedin']);
    });
  });

  describe('consumeInvite', () => {
    it('matches on the hashed token and only claims unused, unexpired invites', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'invite-1' }] });
      const id = await repo.consumeInvite('raw-token');
      const [sql, vals] = query.mock.calls[0];
      expect(sql).toContain('used_at IS NULL AND expires_at > now()');
      expect(vals).toEqual([hashToken('raw-token')]);
      expect(id).toBe('invite-1');
    });

    it('returns null when no invite row was claimed', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await expect(repo.consumeInvite('bad')).resolves.toBeNull();
    });
  });

  describe('createInvite', () => {
    it('stores only the hash and returns the raw token', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const token = await repo.createInvite('a1', new Date('2030-01-01'));
      const [sql, vals] = query.mock.calls[0];
      expect(sql).toContain(
        'INSERT INTO admin_invites (token_hash, created_by, expires_at)',
      );
      expect(vals[0]).toBe(hashToken(token));
      expect(vals[0]).not.toBe(token);
      expect(vals[1]).toBe('a1');
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes hex
    });
  });

  describe('countAdmins', () => {
    it('counts only ADMIN-role users for the last-admin safety rail', async () => {
      query.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      await expect(repo.countAdmins()).resolves.toBe(2);
      const [sql] = query.mock.calls[0];
      expect(sql).toContain("WHERE role = 'ADMIN'");
    });
  });

  describe('writeAuditLog', () => {
    it('inserts the action with admin, target type and target id', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await repo.writeAuditLog('a1', 'USER_DELETED', 'user', 'u2');
      const [sql, vals] = query.mock.calls[0];
      expect(sql).toContain(
        'INSERT INTO audit_logs (admin_id, action, target_type, target_id)',
      );
      expect(vals).toEqual(['a1', 'USER_DELETED', 'user', 'u2']);
    });
  });
});
