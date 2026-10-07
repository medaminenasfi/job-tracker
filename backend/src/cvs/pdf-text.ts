// PDF text extraction for CV uploads.
//
// Why not a pure-JS extractor: PDFs produced by Word and Google Docs store each
// visually-contiguous word as its own text-showing operator, with the space
// implied by positioning rather than written into the string. A JS extractor
// that concatenates those strings therefore emits "AdaLovelace",
// "SeniorFull-StackEngineer" and even "Exp erience" — and the rule-based
// parser then cannot recognise a section header, so skills land in Experience.
//
// `pdftotext -layout` (poppler-utils) reconstructs the page from glyph
// positions, so the implied spaces come back. It is a pure text extraction with
// no user-supplied LaTeX involved, so it runs as a plain subprocess and does
// not need the Phase 4 compile sandbox.
//
// No heuristic space-insertion is layered on top: splitting on a
// lowercase→uppercase boundary would turn "JavaScript" into "Java Script" and
// "iPhone" into "i Phone", which is a far worse trade than the rare run-together
// word it would fix.

import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const run = promisify(execFile);

// poppler's own limits, not ours: a CV is a few pages of text. These stop a
// hostile or corrupt file from pinning the API process.
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const EXTRACT_TIMEOUT_MS = 15_000;

/** Thrown when poppler is not installed, so the caller can degrade gracefully. */
export class PdfTextToolMissingError extends Error {
  constructor() {
    super('pdftotext is not available');
    this.name = 'PdfTextToolMissingError';
  }
}

/**
 * Extracts layout-preserving text from a PDF buffer.
 *
 * The buffer is written to a private temp file because poppler seeks while
 * reading; the directory name comes from mkdtemp so it cannot be predicted or
 * collided, and no user-controlled value ever reaches argv or a shell.
 * Throws PdfTextToolMissingError when poppler is absent, and whatever poppler
 * throws for a corrupt or password-protected file.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cv-pdftext-'));
  const file = join(dir, 'cv.pdf');
  try {
    await writeFile(file, buffer);
    // `-enc UTF-8` pins the output encoding rather than inheriting poppler's
    // default, which has changed across releases and was Latin-1 on older ones.
    // A Latin-1 decode turns "Expérience" into mojibake, and the rule-based
    // parser matches accented French section headers — so a wrong encoding
    // silently drops them and every entry falls into Experience.
    const { stdout } = await run(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', file, '-'],
      {
        maxBuffer: MAX_TEXT_BYTES,
        timeout: EXTRACT_TIMEOUT_MS,
        // Must agree with the -enc argument above, or one side re-mangles what
        // the other produced.
        encoding: 'utf8',
      },
    );
    return stdout.trim();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new PdfTextToolMissingError();
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
