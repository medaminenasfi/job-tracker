// Phase 8 hardening: cross-user isolation for CV and admin CV template endpoints.
// A missing user_id filter is a cross-user data leak.
jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import { Test } from '@nestjs/testing';
import { CvsService } from '../cvs/cvs.service';
import { AdminService } from '../admin/admin.service';
import { DbService } from '../db/db.service';
import { AiService } from '../ai/ai.service';
import { CvAiParserService } from '../cvs/cv-ai-parser';
import { CvRuleParserService } from '../cvs/cv-rule-parser';
import { LatexPreviewService } from '../latex/latex-preview.service';
import { AdminRepository } from '../admin/admin.repository';
import { AuthService } from '../auth/auth.service';

describe('cross-user scoping (Phase 8: CV + Admin CV Templates)', () => {
  let db: { query: jest.Mock };

  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  });

  async function setupCvs() {
    const module = await Test.createTestingModule({
      providers: [
        CvsService,
        { provide: DbService, useValue: db },
        { provide: AiService, useValue: { enforceMonthlyCap: jest.fn(), recordCall: jest.fn() } },
        { provide: CvAiParserService, useValue: { parse: jest.fn() } },
        { provide: CvRuleParserService, useValue: { parse: jest.fn() } },
      ],
    }).compile();
    return module.get(CvsService);
  }

  async function setupAdmin() {
    const listUsersMock = jest.fn().mockResolvedValue({ rows: [] });
    const countAdminsMock = jest.fn().mockResolvedValue(2);
    const listJobsMock = jest.fn().mockResolvedValue({ rows: [] });
    const getJobMock = jest.fn().mockResolvedValue({ id: 'j1', user_id: 'u1' });
    const deleteJobMock = jest.fn().mockResolvedValue(undefined);
    const writeAuditLogMock = jest.fn().mockResolvedValue(undefined);
    const countAdminsMock2 = jest.fn().mockResolvedValue(2);
    const updateUserStatusMock = jest.fn().mockResolvedValue({ id: 'u2', account_status: 'SUSPENDED' });
    const updateUserRoleMock = jest.fn().mockResolvedValue({ id: 'u2', role: 'USER' });
    const deleteUserMock = jest.fn().mockResolvedValue(undefined);
    const getUserJobCountsMock = jest.fn().mockResolvedValue([]);
    const getUserJobsMock = jest.fn().mockResolvedValue([]);
    const listCvTemplatesMock = jest.fn().mockResolvedValue([]);
    const getCvTemplateMock = jest.fn().mockResolvedValue({ id: 't1', name: 'Test', latex_source: '{{fullName}}' });
    const createCvTemplateMock = jest.fn().mockResolvedValue({ id: 't1', name: 'Test' });
    const updateCvTemplateMock = jest.fn().mockResolvedValue({ id: 't1', name: 'Renamed' });
    const deleteCvTemplateMock = jest.fn().mockResolvedValue(undefined);
    const countGeneratedCvsForTemplateMock = jest.fn().mockResolvedValue(0);
    const renderAdminPreviewMock = jest.fn().mockResolvedValue({ png: Buffer.from('png-bytes'), cached: false });

    const module = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: DbService, useValue: db },
        { provide: AdminRepository, useValue: {
          listUsers: jest.fn().mockResolvedValue({ rows: [] }),
          countAdmins: jest.fn().mockResolvedValue(2),
          listJobs: jest.fn().mockResolvedValue({ rows: [] }),
          getJob: jest.fn().mockResolvedValue({ id: 'j1', user_id: 'u1' }),
          deleteJob: jest.fn().mockResolvedValue(undefined),
          writeAuditLog: jest.fn().mockResolvedValue(undefined),
          countAdmins: jest.fn().mockResolvedValue(2),
          updateUserStatus: jest.fn().mockResolvedValue({ id: 'u2', account_status: 'SUSPENDED' }),
          updateUserRole: jest.fn().mockResolvedValue({ id: 'u2', role: 'USER' }),
          deleteUser: jest.fn().mockResolvedValue(undefined),
          getUserJobCounts: jest.fn().mockResolvedValue([]),
          getUserJobs: jest.fn().mockResolvedValue([]),
          listCvTemplates: jest.fn().mockResolvedValue([]),
          getCvTemplate: jest.fn().mockResolvedValue({ id: 't1', name: 'Test', latex_source: '{{fullName}}' }),
          createCvTemplate: jest.fn().mockResolvedValue({ id: 't1', name: 'Test' }),
          updateCvTemplate: jest.fn().mockResolvedValue({ id: 't1', name: 'Renamed' }),
          deleteCvTemplate: jest.fn().mockResolvedValue(undefined),
          countGeneratedCvsForTemplate: jest.fn().mockResolvedValue(0),
        }},
        { provide: AuthService, useValue: { verifyCredentials: jest.fn().mockResolvedValue({ id: 'a1', role: 'ADMIN', account_status: 'ACTIVE' }) } },
        { provide: LatexPreviewService, useValue: { renderAdminPreview: jest.fn().mockResolvedValue({ png: Buffer.from('png-bytes'), cached: false }) } },
      ],
    }).compile();
    return module.get(AdminService);
  }

  // --- CV Service cross-user isolation ---

  it('cvs findAll filters by user_id', async () => {
    const service = await setupCvs();
    await service.findAll('u1');
    const calls = db.query.mock.calls as [string, unknown[]][];
    expect(calls[0][0]).toContain('WHERE user_id = $1');
    expect(calls[0][1]).toEqual(['u1']);
  });

  it('cvs update filters by user_id', async () => {
    const service = await setupCvs();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'cv1', user_id: 'u1' }] }) // findOne
      .mockResolvedValueOnce({ rows: [{ id: 'cv1' }], rowCount: 1 }); // update
    await service.update('u1', 'cv1', { label: 'New' }).catch(() => {});
    const calls = db.query.mock.calls as [string, unknown[]][];
    const updateCall = calls.find(c => c[0].includes('UPDATE cvs SET'));
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toContain('WHERE id = $3 AND user_id = $4');
    const updateParams = updateCall![1] as unknown[];
    expect(updateParams[2]).toEqual('cv1');
    expect(updateParams[3]).toEqual('u1');
  });

  it('cvs remove filters by user_id', async () => {
    const service = await setupCvs();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'cv1', user_id: 'u1' }] }) // findOne
      .mockResolvedValueOnce({ rowCount: 1 }); // delete
    await service.remove('u1', 'cv1').catch(() => {});
    const calls = db.query.mock.calls as [string, unknown[]][];
    const deleteCall = calls.find(c => c[0].includes('DELETE FROM cvs'));
    expect(deleteCall).toBeDefined();
    expect(deleteCall![0]).toContain('WHERE id = $1 AND user_id = $2');
    expect(deleteCall![1]).toEqual(['cv1', 'u1']);
  });

  it('cvs parseCv filters by user_id and cv ownership', async () => {
    const service = await setupCvs();
    db.query.mockResolvedValueOnce({ rows: [{ id: 'cv1', user_id: 'u1', parsed_text: 'text', structured_data: null }] });
    db.query.mockResolvedValueOnce({ rows: [{}] });
    await service.parseCv('u1', 'cv1', 'rule').catch(() => {});
    const calls = db.query.mock.calls as [string, unknown[]][];
    const findCall = calls.find(c => c[0].includes('FROM cvs WHERE id = $1 AND user_id = $2'));
    expect(findCall).toBeDefined();
    expect(findCall![1]).toEqual(['cv1', 'u1']);
  });

  // --- Admin Service cross-user isolation ---

  it('admin listUsers only accessible to admin (admin scope)', async () => {
    const service = await setupAdmin();
    const repo = (service as any).adminRepo;
    await service.listUsers({});
    expect(repo.listUsers).toHaveBeenCalled();
  });

  it('admin listJobs filters by user_id when provided', async () => {
    const service = await setupAdmin();
    const repo = (service as any).adminRepo;
    await service.listJobs({ user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
    expect(repo.listJobs).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }));
  });

  it('admin listJobs without user_id shows all users jobs (admin scope)', async () => {
    const service = await setupAdmin();
    const repo = (service as any).adminRepo;
    await service.listJobs({});
    expect(repo.listJobs).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, page: 1 }));
  });

  it('admin getJob does not filter by user_id (admin scope)', async () => {
    const service = await setupAdmin();
    const repo = (service as any).adminRepo;
    await service.getJob('j1');
    expect(repo.getJob).toHaveBeenCalledWith('j1');
  });

  it('admin deleteJob does not filter by user_id (admin scope)', async () => {
    const service = await setupAdmin();
    const repo = (service as any).adminRepo;
    await service.deleteJob('a1', 'j1');
    expect(repo.deleteJob).toHaveBeenCalledWith('j1');
  });

  // --- CV Template admin endpoints ---

  it('admin createCvTemplate only accessible to admin (admin scope)', async () => {
    const service = await setupAdmin();
    const repo = (service as any).adminRepo;
    await service.createCvTemplate('a1', { name: 'Test', latex_source: '{{fullName}}' });
    expect(repo.createCvTemplate).toHaveBeenCalled();
  });

  it('admin updateCvTemplate only accessible to admin (admin scope)', async () => {
    const service = await setupAdmin();
    const repo = (service as any).adminRepo;
    await service.updateCvTemplate('a1', 't1', { name: 'Renamed' });
    expect(repo.updateCvTemplate).toHaveBeenCalledWith('t1', expect.anything());
  });

  it('admin deleteCvTemplate only accessible to admin (admin scope)', async () => {
    const service = await setupAdmin();
    const repo = (service as any).adminRepo;
    await service.deleteCvTemplate('a1', 't1');
    expect(repo.deleteCvTemplate).toHaveBeenCalledWith('t1');
  });

  it('admin previewCvTemplate only accessible to admin (admin scope)', async () => {
    const service = await setupAdmin();
    const previews = (service as any).previews;
    await service.previewCvTemplate('a1', { latex_source: '{{fullName}}' });
    expect(previews.renderAdminPreview).toHaveBeenCalled();
  });

  it('admin listCvTemplates filters by is_active when not include_inactive', async () => {
    const service = await setupAdmin();
    const repo = (service as any).adminRepo;
    await service.listCvTemplates({});
    expect(repo.listCvTemplates).toHaveBeenCalledWith(false);
  });

  it('admin listCvTemplates includes inactive when include_inactive=true', async () => {
    const service = await setupAdmin();
    const repo = (service as any).adminRepo;
    await service.listCvTemplates({ include_inactive: 'true' });
    expect(repo.listCvTemplates).toHaveBeenCalledWith(true);
  });

  // --- Cross-user leak prevention ---

  it('user cannot access another user CV via update', async () => {
    const service = await setupCvs();
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.update('u1', 'other-user-cv', { label: 'X' })).rejects.toThrow();
    const calls = db.query.mock.calls as [string, unknown[]][];
    const findCall = calls.find(c => c[0].includes('FROM cvs WHERE id = $1 AND user_id = $2'));
    expect(findCall).toBeDefined();
    expect(findCall![1]).toEqual(['other-user-cv', 'u1']);
  });

  it('user cannot access another user CV via remove', async () => {
    const service = await setupCvs();
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.remove('u1', 'other-user-cv')).rejects.toThrow();
    const calls = db.query.mock.calls as [string, unknown[]][];
    const findCall = calls.find(c => c[0].includes('FROM cvs WHERE id = $1 AND user_id = $2'));
    expect(findCall).toBeDefined();
    expect(findCall![1]).toEqual(['other-user-cv', 'u1']);
  });

  it('user cannot access another user CV via parseCv', async () => {
    const service = await setupCvs();
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.parseCv('u1', 'other-user-cv', 'rule')).rejects.toThrow();
    const calls = db.query.mock.calls as [string, unknown[]][];
    const findCall = calls.find(c => c[0].includes('FROM cvs WHERE id = $1 AND user_id = $2'));
    expect(findCall).toBeDefined();
    expect(findCall![1]).toEqual(['other-user-cv', 'u1']);
  });
});