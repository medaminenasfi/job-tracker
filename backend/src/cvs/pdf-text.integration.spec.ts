import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractPdfText, PdfTextToolMissingError } from './pdf-text';

// Real poppler, real fixtures. Deliberately in its own file: pdf-text.spec.ts
// mocks child_process at module scope, so an "integration" block there would
// only ever re-assert the mock's canned stdout.
//
// Opt-in, because a dev machine without poppler should skip rather than fail:
//   CV_INTEGRATION=1 npx jest src/cvs/pdf-text.integration
// The backend container has poppler-utils installed, so that is the cheapest
// place to run it:
//   docker exec jobtracker_backend sh -c "CV_INTEGRATION=1 npx jest src/cvs/pdf-text.integration"

const integration =
  process.env.CV_INTEGRATION === '1' ? describe : describe.skip;

const fixture = (name: string) =>
  join(process.cwd(), 'test', 'fixtures', name);

/** Resolved once, at collection time, so no test can pass vacuously. */
function hasPoppler(): boolean {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

integration('extractPdfText with the real poppler binary', () => {
  const POPPLER = hasPoppler();

  // The whole point of the switch to pdftotext: poppler reconstructs the spaces
  // between text runs that a string-concatenating extractor drops, which is
  // what produced "SeniorFull-StackEngineer" and pushed skills into Experience.
  (POPPLER ? it : it.skip)(
    'produces properly spaced text on the run-together fixture',
    async () => {
      const text = await extractPdfText(
        readFileSync(fixture('run-together-words.pdf')),
      );

      expect(text).toContain('Senior Full-Stack Engineer');
      expect(text).toContain('Experience');
      expect(text).toContain('Shipped a R&D platform used by 40+ teams.');
      // These are exactly what the old string-concatenating extractor produced.
      expect(text).not.toMatch(/SeniorFull-StackEngineer/);
      expect(text).not.toMatch(/Shippeda/);
    },
  );

  // The other half of the same problem: characters, not just spacing. A French
  // CV's section headers are accented, so a mis-decoded extraction makes every
  // header unmatchable and the parser dumps the whole CV into Experience. This
  // is the precondition the cv-rule-parser header tests depend on.
  (POPPLER ? it : it.skip)(
    'preserves accented French headers on the accented fixture',
    async () => {
      const text = await extractPdfText(
        readFileSync(fixture('accented-french.pdf')),
      );

      expect(text).toContain('Mohamed Amine Nasfi');
      expect(text).toContain('Compétences Techniques');
      expect(text).toContain('Expérience');
      // Neither mojibake ("ExpÃ©rience") nor the U+FFFD of a failed decode.
      expect(text).not.toMatch(/Ã©|\uFFFD/);
    },
  );

  // A non-PDF upload must surface as a failure, not as an empty CV: silently
  // returning nothing would look like "no text found" and leave the user
  // staring at an empty profile with no explanation.
  (POPPLER ? it : it.skip)(
    'rejects a file that is not a PDF, and not as a missing binary',
    async () => {
      await expect(
        extractPdfText(Buffer.from('this is plainly not a pdf')),
      ).rejects.not.toBeInstanceOf(PdfTextToolMissingError);
    },
  );

  // The degraded-fallback contract has to hold against a real missing binary,
  // not just a mocked ENOENT: CvsService can only fall back safely if it can
  // tell "no poppler installed" apart from "this upload is broken".
  (POPPLER ? it.skip : it)(
    'reports a missing binary distinctly from a broken file',
    async () => {
      await expect(
        extractPdfText(readFileSync(fixture('accented-french.pdf'))),
      ).rejects.toBeInstanceOf(PdfTextToolMissingError);
    },
  );
});