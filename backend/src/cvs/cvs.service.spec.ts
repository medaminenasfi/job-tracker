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
const extractRawTextMock =
  jest.fn<(opts: { buffer: Buffer }) => Promise<{ value: string }>>();
jest.mock('mammoth', () => ({ extractRawText: extractRawTextMock }));
const mkdirMock = jest.fn<() => Promise<void>>();
const writeFileMock = jest.fn<(path: string, data: Buffer) => Promise<void>>();
const unlinkMock = jest.fn<(path: string) => Promise<void>>();
jest.mock('fs/promises', () => ({
  mkdir: mkdirMock,
  writeFile: writeFileMock,
  unlink: unlinkMock,
}));

import { CvsService, cvMaxBytes } from './cvs.service';
import { DbService } from '../db/db.service';

const queryMock =
  jest.fn<
    (
      sql: string,
      values?: unknown[],
    ) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>
  >();

function makeService() {
  const db = { query: queryMock } as unknown as DbService;
  return new CvsService(db);
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
  extractRawTextMock.mockReset();
  mkdirMock.mockReset();
  writeFileMock.mockReset();
  unlinkMock.mockReset();
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
      pdfParseMock.mockResolvedValue({ text: '  pdf text  ' });
      queryMock.mockResolvedValue({ rows: [{ id: 'cv1' }] });
      const service = makeService();

      const row = await service.upload('user1', makeFile(PDF_BYTES), 'Dev CV');

      expect(pdfParseMock).toHaveBeenCalledWith(PDF_BYTES);
      expect(mkdirMock).toHaveBeenCalled();
      expect(writeFileMock).toHaveBeenCalledWith(
        expect.stringContaining('cv1.pdf'),
        PDF_BYTES,
      );
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO cvs'),
        ['cv1', 'user1', 'Dev CV', '/api/cvs/cv1/file', 'pdf text'],
      );
      expect(row).toEqual({ id: 'cv1' });
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

    it('rejects a missing label', async () => {
      const service = makeService();
      await expect(
        service.upload('user1', makeFile(PDF_BYTES), '   '),
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
      pdfParseMock.mockRejectedValue(new Error('parser exploded'));
      const service = makeService();
      await expect(
        service.upload('user1', makeFile(PDF_BYTES), 'CV'),
      ).rejects.toThrow('Could not read the file');
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
  });
});
