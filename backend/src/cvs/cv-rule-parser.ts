import { Injectable } from '@nestjs/common';
import { CvStructuredData } from './cv-schemas';

// Maintained keyword list — deliberately not hardcoded English-only strings;
// this is the hook point for MVP7's French localization.
const SECTION_KEYWORDS: Record<
  'experience' | 'education' | 'skills',
  string[]
> = {
  experience: [
    'experience',
    'expériences',
    'expérience',
    'work experience',
    'professional experience',
    'career history',
    'employment history',
    'expérience professionnelle',
    'parcours professionnel',
  ],
  education: [
    'education',
    'formation',
    'academic background',
    'education & training',
    'études',
    'diplômes',
  ],
  skills: [
    'skills',
    'compétences',
    'technical skills',
    'technologies',
    'tools & technologies',
    'skills & tools',
    'languages',
    'langues',
  ],
};

// Words allowed to trail a section keyword: "Compétences Techniques",
// "Expérience professionnelle", "Compétences et outils". Closed on purpose.
// An open "starts with the keyword" rule would read a bullet like "Skills
// developed during the role" as a header and dump the rest of the CV into the
// wrong section, which is worse than missing a header.
const HEADER_QUALIFIERS = new Set([
  'technique',
  'techniques',
  'informatique',
  'informatiques',
  'professionnel',
  'professionnelle',
  'professionnels',
  'professionnelles',
  'actuel',
  'actuelle',
  'actuels',
  'actuelles',
  'acquis',
  'acquises',
  'et',
  'and',
  'outils',
  'tools',
]);

/**
 * Folds a header line to its match form: lowercased, accents removed, and all
 * punctuation/extra whitespace collapsed to single spaces.
 *
 * Accent folding is not cosmetic for French CVs — "Compétences" and
 * "Competences" are the same header, and plenty of CVs are typed on an
 * ASCII-only keyboard or lose their accents in a copy-paste.
 */
function normalizeHeader(line: string): string {
  return line
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Matches a folded line against the keyword table, allowing a trailing
 * qualifier. Returns the section it names, or null.
 *
 * The keyword table is checked entry by entry so a two-word keyword
 * ("professional experience") is preferred over its own one-word prefix
 * ("experience") when both could match.
 */
function matchSectionKey(folded: string): keyof typeof SECTION_KEYWORDS | null {
  const words = folded.split(' ');
  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    for (const keyword of keywords) {
      const keyWords = normalizeHeader(keyword).split(' ');
      if (words.length < keyWords.length) continue;
      const head = words.slice(0, keyWords.length).join(' ');
      if (head !== keyWords.join(' ')) continue;
      const rest = words.slice(keyWords.length);
      if (rest.every((word) => HEADER_QUALIFIERS.has(word))) {
        return section as keyof typeof SECTION_KEYWORDS;
      }
    }
  }
  return null;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const LINK_HOST_RE =
  /(linkedin|github|portfolio|behance|dribbble|about\.me|codepen|gitlab)/i;
const YEAR_RE = /\b(19|20)\d{2}\b/g;
const PRESENT_RE = /\b(present|présent|actuel|current)\b/i;
const YEAR_RANGE_ONLY_RE = /^\d{4}\s*[-–]\s*\d{4}$/;
const BULLET_RE = /^[•\-*▪◦·]\s*/;
// A wrapped line continues the previous one when it starts lowercase, with an
// opening bracket, or with punctuation — shapes a real new entry never starts
// with. Imperfect on purpose: a wrap that begins with a proper noun stays
// split (reads fine), while the opposite mistake glues two entries together.
const CONTINUATION_RE = /^[a-zà-öø-ÿ(«'’]/;

/**
 * Rebuilds readable lines from extracted text: PDF/Word extraction wraps
 * paragraphs at the column edge, so one bullet arrives as two or three lines.
 * Bullet markers open a new line, continuations are glued back with a single
 * space, and everything else (role line, company line, category label) starts
 * a line of its own.
 */
function foldWrappedLines(sectionText: string): string[] {
  const lines: string[] = [];
  for (const raw of sectionText.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const isBullet = BULLET_RE.test(trimmed);
    // `-layout` output is column-padded, so a single field can arrive as
    // "Anglais                    Professionnel". Collapse the run here; the
    // CV builder would otherwise print the gap verbatim.
    const clean = trimmed.replace(BULLET_RE, '').replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    const prev = lines[lines.length - 1];
    if (prev && !isBullet && CONTINUATION_RE.test(clean)) {
      lines[lines.length - 1] = `${prev} ${clean}`;
    } else {
      lines.push(clean);
    }
  }
  return lines;
}

export type RuleParseStatus = 'parsed' | 'partial' | 'failed';

export type RuleParseResult = {
  data: CvStructuredData;
  status: RuleParseStatus;
};

type Sections = Partial<Record<'experience' | 'education' | 'skills', string>>;

@Injectable()
export class CvRuleParserService {
  parse(text: string): RuleParseResult {
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        data: { experience: [], education: [], skills: [] },
        status: 'failed',
      };
    }

    const sections = this.splitSections(trimmed);
    const experience = sections.experience
      ? this.parseEntries(sections.experience)
      : [];
    const education = sections.education
      ? this.parseEntries(sections.education)
      : [];
    const skills = sections.skills ? this.parseSkills(sections.skills) : [];

    const found = [
      sections.experience,
      sections.education,
      sections.skills,
    ].filter(Boolean).length;
    const status: RuleParseStatus =
      found === 0 ? 'failed' : found === 3 ? 'parsed' : 'partial';

    return {
      data: {
        fullName: this.findName(trimmed),
        email: EMAIL_RE.exec(trimmed)?.[0],
        phone: this.findPhone(trimmed),
        links: this.findLinks(trimmed),
        experience,
        education,
        skills,
      },
      status,
    };
  }

  // First non-empty line that is not contact info, a URL, or a section
  // header — CVs conventionally start with the candidate's name.
  private findName(text: string): string | undefined {
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.length > 60) continue;
      if (EMAIL_RE.test(line) || URL_RE.test(line)) continue;
      if (this.isSectionHeader(line)) continue;
      const words = line.split(/\s+/);
      if (words.length > 6) continue;
      return line;
    }
    return undefined;
  }

  // Permissive international pattern, then reject date-range lookalikes
  // ("2021 - 2023") and anything with an implausible digit count.
  private findPhone(text: string): string | undefined {
    const match = PHONE_RE.exec(text);
    if (!match) return undefined;
    const candidate = match[0].trim();
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return undefined;
    if (YEAR_RANGE_ONLY_RE.test(candidate)) return undefined;
    return candidate;
  }

  private findLinks(text: string): string[] {
    // Protocol is optional — CVs often write "linkedin.com/in/x".
    const urls = text.match(/(?:https?:\/\/)?[^\s<>"')\]]+/gi) ?? [];
    const links = urls
      .map((u) => u.replace(/[.,;:!?]+$/, ''))
      // Require a dot so bare words like "portfolio" don't match.
      .filter((u) => u.includes('.') && LINK_HOST_RE.test(u));
    return [...new Set(links)];
  }

  private isSectionHeader(line: string): boolean {
    return matchSectionKey(normalizeHeader(line)) !== null;
  }

  // Splits the text at section-header lines; everything after a header
  // belongs to that section until the next header.
  private splitSections(text: string): Sections {
    const sections: Sections = {};
    let current: keyof Sections | null = null;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      const header = this.matchHeader(line);
      if (header) {
        current = header;
        // A CV commonly has several blocks that map to the same field —
        // "Compétences Techniques" followed by "Langues" both belong to skills.
        // Starting from '' here would discard the first block and hand the user
        // only the languages, so an existing section is kept and the new block
        // appended after a blank line (the entry splitters read that break).
        sections[current] =
          current in sections ? `${sections[current]}\n\n` : '';
        continue;
      }
      if (current) {
        // Keep the original line (including blank lines) — parseEntries
        // relies on blank lines to separate entries.
        sections[current] = `${sections[current]}\n${rawLine}`;
      }
    }
    return sections;
  }

  private matchHeader(line: string): keyof Sections | null {
    // A header is a short standalone line; the guard keeps prose out of the
    // header matcher even when it happens to start with a keyword.
    if (line.length > 40) return null;
    return matchSectionKey(normalizeHeader(line));
  }

  // Entries are separated by blank lines or bullet markers. The date range
  // is pulled from the entry; the rest stays raw text.
  private parseEntries(sectionText: string) {
    const chunks = sectionText
      .split(/\n\s*\n|\n(?=\s*[•\-*▪◦·])/)
      .map((c) => c.trim())
      .filter((c) => c.length >= 3)
      .slice(0, 50);

    return chunks.map((chunk) => {
      // Extraction wraps paragraphs at the column edge; without folding, every
      // wrapped fragment prints on its own line in the CV builder.
      const text = foldWrappedLines(chunk).join('\n');
      const years = chunk.match(YEAR_RE) ?? [];
      let dateRange: string | undefined;
      if (years.length > 0) {
        const end = PRESENT_RE.test(chunk)
          ? 'Present'
          : years.length > 1
            ? years[years.length - 1]
            : undefined;
        dateRange = end ? `${years[0]} - ${end}` : years[0];
      }
      return { text, ...(dateRange ? { dateRange } : {}) };
    });
  }

  private parseSkills(sectionText: string): string[] {
    const skills = sectionText
      // `:` is a separator because the common "-layout" layout is
      // "Front-End : HTML, CSS" — the category label is not itself a skill.
      .split(/[,;:\n|•*▪◦·]|\s+-\s+/)
      // `-layout` output is column-padded, so a single field can arrive as
      // "Anglais                    Professionnel". Collapse the run, and drop the
      // sentence punctuation that trails the last item of a bullet, or every
      // chip in the CV builder renders with a stray gap or full stop.
      .map((s) => s.replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, ''))
      .filter((s) => s.length >= 1 && s.length <= 60);
    // Known limitation: the structured model has no separate languages field, so
    // a "Langues" block lands in skills alongside the technologies. Dropping it
    // would lose real content, so it is kept and left for the user to prune.
    // Case is preserved — a CV printing "docker" instead of "Docker" reads as a
    // typo — and only the de-duplication ignores case.
    const seen = new Set<string>();
    return skills
      .filter((s) => {
        const key = s.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 100);
  }
}
