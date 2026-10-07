import { BadRequestException, NotFoundException } from '@nestjs/common';
import { jest, describe, expect, it, beforeEach } from '@jest/globals';

// Deterministic UUIDs keep the file-path assertions stable.
// Only randomUUID is used by the code under test in this file.
jest.mock('crypto', () => ({
  randomUUID: () => 'cv1',
}));

// Parser and fs dependencies are mocked so tests never touch disk or
// run real PDF/DOCX extraction.
const pdfParseMock = jest.fn<(buffer: Buffer) => Promise<{ text: string }>>();
jest.mock('pdf-parse', () => pdfParseMock);
// pdftotext is the primary PDF extractor; pdf-parse is only the degraded
// fallback for environments without poppler.
const extractPdfTextMock = jest.fn<(buffer: Buffer) => Promise<string>>();
jest.mock('./pdf-text', () => ({
  extractPdfText: extractPdfTextMock,
  PdfTextToolMissingError: class PdfTextToolMissingError extends Error {},
}));
const extractRawTextMock =
  jest.fn<(opts: { buffer: Buffer }) => Promise<{ value: string }>>();
jest.mock('mammoth', () => ({ extractRawText: extractRawTextMock }));
const mkdirMock = jest.fn<() => Promise<void>>();
const writeFileMock = jest.fn<(path: string, data: Buffer) => Promise<void>>();
const unlinkMock = jest.fn<(path: string) => Promise<void>>();
const readFileMock = jest.fn<() => Promise<Buffer>>();
const aiParserMock =
  jest.fn<(text: string) => Promise<Record<string, unknown>>>();
const enforceMonthlyCapMock = jest.fn<(userId: string) => Promise<void>>();
const recordCallMock = jest.fn<(userId: string) => Promise<void>>();
jest.mock('fs/promises', () => ({
  mkdir: mkdirMock,
  writeFile: writeFileMock,
  unlink: unlinkMock,
  readFile: readFileMock,
}));

import { CvsService, cvMaxBytes, defaultCvLabel } from './cvs.service';
import { CvRuleParserService } from './cv-rule-parser';
import { CvAiParserService } from './cv-ai-parser';
import { AiService } from '../ai/ai.service';
import { DbService } from '../db/db.service';
import { PdfTextToolMissingError } from './pdf-text';
import { join } from 'path';

const queryMock =
  jest.fn<
    (
      sql: string,
      values?: unknown[],
    ) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>
  >();

function makeService() {
  const db = { query: queryMock } as unknown as DbService;
  const ruleParser = new CvRuleParserService();
  const aiParser = { parse: aiParserMock } as unknown as CvAiParserService;
  const ai = {
    enforceMonthlyCap: enforceMonthlyCapMock,
    recordCall: recordCallMock,
  } as unknown as AiService;
  return new CvsService(db, ruleParser, aiParser, ai);
}

function makeFile(buffer: Buffer, size = buffer.length): Express.Multer.File {
  return {
    originalname: 'cv.pdf',
    mimetype: 'application/pdf',
    size,
    buffer,
  } as Express.Multer.File;
}

const PDF_BYTES = Buffer.from('%PDF-1.4 fake pdf content');
const DOCX_BYTES = Buffer.from('PK\x03\x04fake docx zip content');
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

beforeEach(() => {
  queryMock.mockReset();
  pdfParseMock.mockReset();
  extractPdfTextMock.mockReset();
  extractRawTextMock.mockReset();
  mkdirMock.mockReset();
  writeFileMock.mockReset();
  unlinkMock.mockReset();
  // No stored file by default — tests that exercise refreshExtractedText
  // override this. Keeps every existing expectations unchanged.
  readFileMock.mockReset().mockRejectedValue(
    Object.assign(new Error('gone'), { code: 'ENOENT' }),
  );
  aiParserMock.mockReset();
  enforceMonthlyCapMock.mockReset();
  recordCallMock.mockReset();
});

describe('CvsService', () => {
  describe('detectKind', () => {
    it('identifies PDF and DOCX from magic bytes, rejects anything else', () => {
      const service = makeService();
      expect(service.detectKind(PDF_BYTES)).toBe('pdf');
      expect(service.detectKind(DOCX_BYTES)).toBe('docx');
      // A client can claim any MIME type — magic bytes decide.
      expect(service.detectKind(PNG_BYTES)).toBeNull();
      expect(service.detectKind(Buffer.from('plain text'))).toBeNull();
    });
  });

  describe('upload', () => {
    it('extracts PDF text, stores the file and row, scoped to the user', async () => {
      // extractPdfText already trims its stdout.
      extractPdfTextMock.mockResolvedValue('pdf text');
      queryMock.mockResolvedValue({ rows: [{ id: 'cv1' }] });
      const service = makeService();

      const row = await service.upload('user1', makeFile(PDF_BYTES), 'Dev CV');

      expect(extractPdfTextMock).toHaveBeenCalledWith(PDF_BYTES);
      expect(mkdirMock).toHaveBeenCalled();
      expect(writeFileMock).toHaveBeenCalledWith(
        expect.stringContaining('cv1.pdf'),
        PDF_BYTES,
      );
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO cvs'),
        [
          'cv1',
          'user1',
          'Dev CV',
          '/api/cvs/cv1/file',
          'pdf text',
          expect.any(String), // structured_data JSON
          'failed', // 'pdf text' has no recognizable sections
        ],
      );
      expect(row).toEqual({ id: 'cv1' });
    });

    // Degraded mode only: poppler missing means pdf-parse, which glues words
    // together, but an upload must still succeed rather than hard-fail.
    it('falls back to pdf-parse when poppler is unavailable', async () => {
      extractPdfTextMock.mockRejectedValue(new PdfTextToolMissingError());
      pdfParseMock.mockResolvedValue({ text: 'glued text' });
      queryMock.mockResolvedValue({ rows: [{ id: 'cv1' }] });
      const service = makeService();

      await service.upload('user1', makeFile(PDF_BYTES), 'Dev CV');

      expect(pdfParseMock).toHaveBeenCalledWith(PDF_BYTES);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO cvs'),
        expect.arrayContaining(['glued text']),
      );
    });

    // A missing poppler must not be able to mask a real extraction failure.
    it('does not fall back when extraction fails for another reason', async () => {
      extractPdfTextMock.mockRejectedValue(
        new Error('Syntax Error: encrypted'),
      );
      const service = makeService();

      await expect(
        service.upload('user1', makeFile(PDF_BYTES), 'CV'),
      ).rejects.toThrow('Could not read the file');
      expect(pdfParseMock).not.toHaveBeenCalled();
    });

    it('extracts DOCX text via mammoth', async () => {
      extractRawTextMock.mockResolvedValue({ value: 'docx text' });
      queryMock.mockResolvedValue({ rows: [{ id: 'cv2' }] });
      const service = makeService();

      await service.upload('user1', makeFile(DOCX_BYTES), 'Docx CV');

      expect(extractRawTextMock).toHaveBeenCalledWith({ buffer: DOCX_BYTES });
      expect(writeFileMock).toHaveBeenCalledWith(
        expect.stringContaining('cv1.docx'),
        DOCX_BYTES,
      );
    });

    // A blank label used to be a hard error, which is what pushed users into
    // typing throwaway identifiers like "fukk" that then became the permanent
    // name in every dropdown.
    it('derives a label when the user supplies none', async () => {
      extractPdfTextMock.mockResolvedValue('Ada Lovelace\nSenior Engineer');
      queryMock.mockResolvedValue({ rows: [{ id: 'cv1' }] });
      const service = makeService();

      await service.upload('user1', makeFile(PDF_BYTES), '   ');

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO cvs'),
        expect.arrayContaining(['Ada Lovelace']),
      );
    });

    it('still accepts a label the user chose', async () => {
      extractPdfTextMock.mockResolvedValue('Ada Lovelace\nSenior Engineer');
      queryMock.mockResolvedValue({ rows: [{ id: 'cv1' }] });
      const service = makeService();

      await service.upload('user1', makeFile(PDF_BYTES), 'My CV for the bank');

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO cvs'),
        expect.arrayContaining(['My CV for the bank']),
      );
    });

    it('rejects an over-long label', async () => {
      const service = makeService();
      await expect(
        service.upload('user1', makeFile(PDF_BYTES), 'x'.repeat(200)),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a missing file', async () => {
      const service = makeService();
      await expect(
        service.upload('user1', undefined as never, 'CV'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-PDF/DOCX file even with a lying MIME type', async () => {
      const service = makeService();
      await expect(
        service.upload('user1', makeFile(PNG_BYTES), 'CV'),
      ).rejects.toThrow('Only PDF or DOCX files are supported');
    });

    it('rejects an oversized file', async () => {
      const service = makeService();
      const huge = makeFile(PDF_BYTES, cvMaxBytes() + 1);
      await expect(service.upload('user1', huge, 'CV')).rejects.toThrow(
        'limit',
      );
    });

    it('maps parser failures to a generic message', async () => {
      extractPdfTextMock.mockRejectedValue(new Error('parser exploded'));
      const service = makeService();
      await expect(
        service.upload('user1', makeFile(PDF_BYTES), 'CV'),
      ).rejects.toThrow('Could not read the file');
    });
  });

  describe('defaultCvLabel', () => {
    const day = new Date('2026-03-04T10:00:00Z');

    it('keeps a label the user actually typed', () => {
      expect(
        defaultCvLabel('  Backend CV  ', { fullName: 'Ada' }, day),
      ).toBe('Backend CV');
    });

    it('combines the parsed name and headline', () => {
      expect(
        defaultCvLabel('', { fullName: 'Ada Lovelace', headline: 'Senior Engineer' }, day),
      ).toBe('Ada Lovelace — Senior Engineer');
    });

    it('falls back to the name alone when there is no headline', () => {
      expect(defaultCvLabel('  ', { fullName: 'Ada Lovelace' }, day)).toBe(
        'Ada Lovelace',
      );
    });

    it('dates the label when nothing could be parsed out of the file', () => {
      expect(defaultCvLabel('', {}, day)).toBe('CV uploaded 2026-03-04');
    });

    it('treats a two-character label as no label', () => {
      expect(defaultCvLabel('ab', { fullName: 'Ada Lovelace' }, day)).toBe(
        'Ada Lovelace',
      );
    });

    // A very long headline must not overflow the column.
    it('truncates an over-long generated label', () => {
      const label = defaultCvLabel(
        '',
        { fullName: 'Ada Lovelace', headline: 'x'.repeat(300) },
        day,
      );
      expect(label.length).toBeLessThanOrEqual(120);
      expect(label.endsWith('...')).toBe(true);
    });
  });

  describe('findAll', () => {
    it('queries only the user rows', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      const service = makeService();
      await service.findAll('user1');
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        ['user1'],
      );
    });
  });

  describe('update', () => {
    it('sets a CV as default after clearing the user other defaults', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'cv1', is_default: true }] });
      const service = makeService();
      await service.update('user1', 'cv1', { is_default: true });

      expect(queryMock).toHaveBeenCalledWith(
        'UPDATE cvs SET is_default = false WHERE user_id = $1',
        ['user1'],
      );
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE cvs SET label = COALESCE'),
        [null, true, 'cv1', 'user1'],
      );
    });

    it('renames without touching the default flag', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'cv1' }] });
      const service = makeService();
      await service.update('user1', 'cv1', { label: 'New name' });
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE cvs SET label = COALESCE'),
        ['New name', null, 'cv1', 'user1'],
      );
    });

    it('rejects invalid input', async () => {
      const service = makeService();
      await expect(
        service.update('user1', 'cv1', { is_default: 'yes' as never }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound for another user CV', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      const service = makeService();
      await expect(
        service.update('user1', 'other-user-cv', { label: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the row and both possible storage files', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'cv1' }], rowCount: 1 });
      const service = makeService();
      await service.remove('user1', 'cv1');

      expect(queryMock).toHaveBeenCalledWith(
        'DELETE FROM cvs WHERE id = $1 AND user_id = $2',
        ['cv1', 'user1'],
      );
      expect(unlinkMock).toHaveBeenCalledTimes(2);
    });

    it('throws NotFound for another user CV', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      const service = makeService();
      await expect(service.remove('user1', 'other-user-cv')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('also removes the build record and the generated PDF for a built CV', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'cv1', source: 'built' }] })
        .mockResolvedValue({ rows: [], rowCount: 1 });
      const service = makeService();

      await service.remove('user1', 'cv1');

      expect(queryMock).toHaveBeenCalledWith(
        'DELETE FROM generated_cvs WHERE id = $1 AND user_id = $2',
        ['cv1', 'user1'],
      );
      expect(unlinkMock).toHaveBeenCalledWith(
        expect.stringContaining(join('uploads', 'generated', 'cv1.pdf')),
      );
    });
  });

  describe('parseCv', () => {
    const cvRow = {
      id: 'cv1',
      user_id: 'user1',
      label: 'Dev CV',
      parsed_text: 'raw text',
      structured_data: null,
    };

    it('runs the AI parser with cap enforcement and records the call', async () => {
      queryMock.mockResolvedValueOnce({ rows: [cvRow] }).mockResolvedValue({
        rows: [{ ...cvRow, parse_method: 'ai', parse_status: 'parsed' }],
      });
      aiParserMock.mockResolvedValue({ fullName: 'Jane', skills: ['TS'] });
      enforceMonthlyCapMock.mockResolvedValue(undefined);
      recordCallMock.mockResolvedValue(undefined);
      const service = makeService();

      const row = await service.parseCv('user1', 'cv1', 'ai');

      expect(enforceMonthlyCapMock).toHaveBeenCalledWith('user1');
      expect(aiParserMock).toHaveBeenCalledWith('raw text');
      expect(recordCallMock).toHaveBeenCalledWith('user1');
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE cvs SET structured_data'),
        [
          JSON.stringify({ fullName: 'Jane', skills: ['TS'] }),
          'ai',
          'parsed',
          'cv1',
          'user1',
          // AI re-parse reuses the stored text; parsed_text is untouched.
          null,
        ],
      );
      expect(row).toMatchObject({ parse_method: 'ai', parse_status: 'parsed' });
    });

    it('rejects an invalid method', async () => {
      const service = makeService();
      await expect(service.parseCv('user1', 'cv1', 'magic')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to re-parse a CV built from a template', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ ...cvRow, source: 'built', parsed_text: null }],
      });
      const service = makeService();

      await expect(service.parseCv('user1', 'cv1', 'ai')).rejects.toThrow(
        BadRequestException,
      );
      // No AI spend and no overwrite of the structured data the user typed.
      expect(aiParserMock).not.toHaveBeenCalled();
      expect(enforceMonthlyCapMock).not.toHaveBeenCalled();
      expect(queryMock).toHaveBeenCalledTimes(1);
    });

    it('throws NotFound for another user CV', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      const service = makeService();
      await expect(
        service.parseCv('user1', 'other-user-cv', 'rule'),
      ).rejects.toThrow(NotFoundException);
    });

    it('re-runs the rule parser without any AI call', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ ...cvRow, parsed_text: 'Skills\nPython, AWS' }],
        })
        .mockResolvedValue({
          rows: [
            { ...cvRow, parse_method: 'rule_based', parse_status: 'partial' },
          ],
        });
      const service = makeService();

      const row = await service.parseCv('user1', 'cv1', 'rule');

      expect(aiParserMock).not.toHaveBeenCalled();
      expect(row.parse_method).toBe('rule_based');
      expect(row.parse_status).toBe('partial');
    });

    // The point of the refresh: a CV whose stored text predates the pdftotext
    // fix must come back with *newly extracted* text, not the old glued one.
    it('re-extracts from the stored file before re-parsing', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ ...cvRow, parsed_text: 'FreelanceMai 2026 – Présent' }],
        })
        .mockResolvedValue({ rows: [{ ...cvRow }] });
      readFileMock.mockResolvedValue(Buffer.from('%PDF-1.5 fake'));
      extractPdfTextMock.mockResolvedValue(
        'Expérience\nFreelance    Mai 2026 – Présent\n\nCompétences Techniques\nReact',
      );
      const service = makeService();

      const row = await service.parseCv('user1', 'cv1', 'rule');

      expect(extractPdfTextMock).toHaveBeenCalledTimes(1);
      const [, values] = queryMock.mock.calls.at(-1)!;
      // parsed_text column is refreshed to the fresh extraction, not the
      // stale glued text it replaces.
      expect(values?.[5]).toBe(
        'Expérience\nFreelance    Mai 2026 – Présent\n\nCompétences Techniques\nReact',
      );
      expect(JSON.parse(String(values?.[0])).skills).toContain('React');
      expect(row).toBeDefined();
    });

    it('falls back to the stored text when the file is gone', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ ...cvRow, parsed_text: 'Skills\nPython' }],
        })
        .mockResolvedValue({ rows: [{ ...cvRow }] });
      // readFileMock already rejects ENOENT by default.
      const service = makeService();

      await service.parseCv('user1', 'cv1', 'rule');

      expect(extractPdfTextMock).not.toHaveBeenCalled();
      const [, values] = queryMock.mock.calls.at(-1)!;
      // No file, no fresh text: parsed_text column is preserved, and the
      // rule parser still runs over the stored text.
      expect(values?.[5]).toBe('Skills\nPython');
    });
  });
});
