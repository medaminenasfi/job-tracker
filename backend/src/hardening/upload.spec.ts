// Phase 8 hardening: file upload validation for CV uploads.
// Ensures real MIME validation, size limits, and storage outside web root.
import { Test } from '@nestjs/testing';
import { CvsService } from '../cvs/cvs.service';
import { DbService } from '../db/db.service';
import { AiService } from '../ai/ai.service';
import { CvAiParserService } from '../cvs/cv-ai-parser';
import { CvRuleParserService } from '../cvs/cv-rule-parser';
import { BadRequestException } from '@nestjs/common';
import * as pdfParse from 'pdf-parse';

jest.mock('pdf-parse', () => jest.fn().mockResolvedValue({ text: 'extracted text' }));

// Helper to create a proper rule parser mock
function makeRuleParserMock() {
  return {
    parse: jest.fn().mockReturnValue({
      data: {
        fullName: 'Test User',
        email: 'test@example.com',
        phone: '',
        headline: 'Developer',
        links: [],
        experience: [],
        education: [],
        skills: [],
      },
      status: 'parsed' as const,
    }),
  };
}

describe('CV upload hardening (Phase 8)', () => {
  let db: { query: jest.Mock };

  beforeEach(() => {
    jest.resetModules();
  });

  function makeService(db: { query: jest.Mock }) {
    return Test.createTestingModule({
      providers: [
        CvsService,
        { provide: DbService, useValue: db },
        { provide: CvAiParserService, useValue: { parse: jest.fn() } },
        { provide: CvRuleParserService, useValue: makeRuleParserMock() },
        { provide: AiService, useValue: { enforceMonthlyCap: jest.fn(), recordCall: jest.fn() } },
      ],
    }).compile().then(m => m.get(CvsService));
  }

  // --- Real MIME type validation ---

  it('rejects fake PDF (wrong magic bytes)', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = await makeService(db);

    const fakePdf = Buffer.from('fake pdf content');
    const file = {
      buffer: fakePdf,
      size: fakePdf.length,
      mimetype: 'application/pdf',
    } as any;

    await expect(service.upload('u1', file, 'Test')).rejects.toThrow(BadRequestException);
  });

  it('rejects fake DOCX (not a valid ZIP)', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = await makeService(db);

    const fakeDocx = Buffer.from('fake docx content');
    const file = {
      buffer: fakeDocx,
      size: fakeDocx.length,
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    } as any;

    await expect(service.upload('u1', file, 'Test')).rejects.toThrow(BadRequestException);
  });

  it('accepts real PDF magic bytes', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = await makeService(db);

    const realPdf = Buffer.from('%PDF-1.4\n%...');
    const file = {
      buffer: realPdf,
      size: realPdf.length,
      mimetype: 'application/pdf',
    } as any;

    db.query.mockResolvedValueOnce({ rows: [{ id: 'cv1', user_id: 'u1', label: 'Test', source: 'uploaded', file_url: '/api/cvs/cv1/file', is_default: false, created_at: new Date().toISOString(), structured_data: {}, parse_method: 'rule_based', parse_status: 'parsed', parsed_at: new Date().toISOString() }] });

    await expect(service.upload('u1', file, 'Test')).resolves.toBeDefined();
  });

  // --- Size limits ---

  it('rejects file over max size (5MB)', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = await makeService(db);

    const largeFile = Buffer.alloc(6 * 1024 * 1024);
    largeFile[0] = 0x25;
    largeFile[1] = 0x50;
    largeFile[2] = 0x44;
    largeFile[3] = 0x46;
    largeFile[4] = 0x2D;

    const file = {
      buffer: largeFile,
      size: largeFile.length,
      mimetype: 'application/pdf',
    } as any;

    await expect(service.upload('u1', file, 'Test')).rejects.toThrow(BadRequestException);
  });

  it('accepts file at exactly max size (5MB)', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = await makeService(db);

    const exactFile = Buffer.alloc(5 * 1024 * 1024);
    exactFile[0] = 0x25;
    exactFile[1] = 0x50;
    exactFile[2] = 0x44;
    exactFile[3] = 0x46;
    exactFile[4] = 0x2D;

    const file = {
      buffer: exactFile,
      size: exactFile.length,
      mimetype: 'application/pdf',
    } as any;

    db.query.mockResolvedValueOnce({ rows: [{ id: 'cv1', user_id: 'u1', label: 'Test', source: 'uploaded', file_url: '/api/cvs/cv1/file', is_default: false, created_at: new Date().toISOString(), structured_data: {}, parse_method: 'rule_based', parse_status: 'parsed', parsed_at: new Date().toISOString() }] });

    await expect(service.upload('u1', file, 'Test')).resolves.toBeDefined();
  });

  it('rejects file with no buffer', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = await makeService(db);

    const file = { buffer: null, size: 100, mimetype: 'application/pdf' } as any;

    await expect(service.upload('u1', file, 'Test')).rejects.toThrow(BadRequestException);
  });

  it('rejects empty file (0 bytes)', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = await makeService(db);

    const file = { buffer: Buffer.alloc(0), size: 0, mimetype: 'application/pdf' } as any;

    await expect(service.upload('u1', file, 'Test')).rejects.toThrow(BadRequestException);
  });
});