import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { extractPdfText, PdfTextToolMissingError } from './pdf-text';

// join() rather than a literal, so the expectations hold on Windows too.
const DIR = '/tmp/cv-pdftext-abc';
const FILE = join(DIR, 'cv.pdf');

const run = promisify(execFile);

jest.mock('child_process', () => ({ execFile: jest.fn() }));
jest.mock('fs/promises', () => ({
  mkdtemp: jest.fn(),
  rm: jest.fn(),
  writeFile: jest.fn(),
}));
jest.mock('os', () => ({ tmpdir: () => '/tmp' }));

const execFileMock = execFile as unknown as jest.Mock;
const mkdtempMock = mkdtemp as unknown as jest.Mock;
const rmMock = rm as unknown as jest.Mock;
const writeFileMock = writeFile as unknown as jest.Mock;

const PDF = Buffer.from('%PDF-1.5 fake');

beforeEach(() => {
  execFileMock.mockReset();
  mkdtempMock.mockReset().mockResolvedValue(DIR);
  rmMock.mockReset().mockResolvedValue(undefined);
  writeFileMock.mockReset().mockResolvedValue(undefined);
  // execFile is promisified at module load, so the mock has to behave like the
  // callback form: (file, args, options, cb).
  execFileMock.mockImplementation(
    (_f: string, _a: string[], _o: unknown, cb: (e: unknown, r: unknown) => void) =>
      cb(null, { stdout: 'Ada Lovelace\nSenior Engineer\n', stderr: '' }),
  );
});

describe('extractPdfText', () => {
  it('returns trimmed layout text', async () => {
    await expect(extractPdfText(PDF)).resolves.toBe(
      'Ada Lovelace\nSenior Engineer',
    );
  });

  // The whole point of the switch: poppler reconstructs the spaces between text
  // runs that a string-concatenating extractor drops.
  it('keeps the spaces between words', async () => {
    execFileMock.mockImplementation(
      (
        _f: string,
        _a: string[],
        _o: unknown,
        cb: (e: unknown, r: unknown) => void,
      ) =>
        cb(null, {
          stdout: 'Senior Engineer, Analytical Engines Ltd (2021 - Present)\n',
          stderr: '',
        }),
    );
    const text = await extractPdfText(PDF);
    expect(text).toContain('Senior Engineer, Analytical Engines Ltd');
    expect(text).not.toMatch(/SeniorEngineer|AnalyticalEngines/);
  });

  it('asks poppler for layout mode and writes to stdout', async () => {
    await extractPdfText(PDF);
    expect(execFileMock).toHaveBeenCalledWith(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', FILE, '-'],
      expect.objectContaining({ timeout: expect.any(Number) }),
      expect.any(Function),
    );
  });

  // The output encoding is pinned rather than inherited: poppler's default has
  // differed between releases, and a Latin-1 decode would make the accented
  // French section headers unmatchable downstream.
  it('pins the output encoding to UTF-8', async () => {
    await extractPdfText(PDF);
    const [, args] = execFileMock.mock.calls[0] as [string, string[]];
    expect(args.slice(0, 3)).toEqual(['-layout', '-enc', 'UTF-8']);
  });

  // Nothing user-controlled may reach argv, and no shell is involved.
  it('never passes the uploaded bytes or a shell to the subprocess', async () => {
    const hostile = Buffer.from('%PDF-1.5"; rm -rf / #');
    await extractPdfText(hostile);
    const [file, args, options] = execFileMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(file).toBe('pdftotext');
    // Flags plus the temp path plus the '-' stdout target. No user bytes.
    expect(args).toHaveLength(5);
    expect(args.every((a) => !a.includes('rm -rf'))).toBe(true);
    expect(options.shell).toBeUndefined();
    expect(options.maxBuffer).toEqual(expect.any(Number));
  });

  it('writes the buffer to a private temp file', async () => {
    await extractPdfText(PDF);
    expect(writeFileMock).toHaveBeenCalledWith(FILE, PDF);
  });

  it('reports a missing poppler so the caller can degrade', async () => {
    execFileMock.mockImplementation(
      (
        _f: string,
        _a: string[],
        _o: unknown,
        cb: (e: unknown) => void,
      ) => {
        const error: NodeJS.ErrnoException = new Error('spawn pdftotext ENOENT');
        error.code = 'ENOENT';
        cb(error);
      },
    );
    await expect(extractPdfText(PDF)).rejects.toBeInstanceOf(
      PdfTextToolMissingError,
    );
  });

  // A corrupt or password-protected PDF must not be mistaken for a missing
  // tool: the caller shows a different message for each.
  it('rethrows a real extraction failure as-is', async () => {
    execFileMock.mockImplementation(
      (
        _f: string,
        _a: string[],
        _o: unknown,
        cb: (e: unknown) => void,
      ) => {
        const error: NodeJS.ErrnoException = new Error(
          'Command failed: Syntax Error: encrypted',
        );
        error.code = 'ELTEXTRACT';
        cb(error);
      },
    );
    await expect(extractPdfText(PDF)).rejects.toThrow(/encrypted/);
    await expect(extractPdfText(PDF)).rejects.not.toBeInstanceOf(
      PdfTextToolMissingError,
    );
  });

  it('cleans up the temp directory on success and on failure', async () => {
    await extractPdfText(PDF);
    expect(rmMock).toHaveBeenCalledWith(DIR, {
      recursive: true,
      force: true,
    });

    rmMock.mockClear();
    execFileMock.mockImplementation(
      (
        _f: string,
        _a: string[],
        _o: unknown,
        cb: (e: unknown) => void,
      ) => cb(new Error('boom')),
    );
    await expect(extractPdfText(PDF)).rejects.toThrow('boom');
    expect(rmMock).toHaveBeenCalledWith(DIR, {
      recursive: true,
      force: true,
    });
  });
});

// The real-binary tests live in pdf-text.integration.spec.ts: this file mocks
// child_process at module scope, so nothing here could exercise poppler itself.
