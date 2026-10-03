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

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const LINK_HOST_RE =
  /(linkedin|github|portfolio|behance|dribbble|about\.me|codepen|gitlab)/i;
const YEAR_RE = /\b(19|20)\d{2}\b/g;
const PRESENT_RE = /\b(present|présent|actuel|current)\b/i;
const YEAR_RANGE_ONLY_RE = /^\d{4}\s*[-–]\s*\d{4}$/;

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
    const normalized = line.toLowerCase().replace(/[:\-–—\s]+$/, '');
    return Object.values(SECTION_KEYWORDS)
      .flat()
      .some((keyword) => normalized === keyword);
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
        sections[current] = '';
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
    if (line.length > 40) return null;
    const normalized = line.toLowerCase().replace(/[:\-–—\s]+$/, '');
    for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
      if (keywords.includes(normalized)) return section as keyof Sections;
    }
    return null;
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
      return { text: chunk, ...(dateRange ? { dateRange } : {}) };
    });
  }

  private parseSkills(sectionText: string): string[] {
    const skills = sectionText
      .split(/[,;\n|•*▪◦·]|\s+-\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 1 && s.length <= 60);
    return [...new Set(skills.map((s) => s.toLowerCase()))].slice(0, 100);
  }
}
