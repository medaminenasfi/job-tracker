import { describe, expect, it } from '@jest/globals';
import { CvRuleParserService } from './cv-rule-parser';

const service = new CvRuleParserService();

const CLEAN_CV = `Jane Doe
jane.doe@email.com
+1 (415) 555-0132
linkedin.com/in/janedoe

Summary
Full-stack developer with 6 years of experience.

Experience
Senior Developer at Acme Corp
2021 - Present
Led the frontend team.

Developer at Beta Inc
2019 - 2021
Built internal tools.

Education
BS Computer Science
State University
2015 - 2019

Skills
TypeScript, React, Node.js, PostgreSQL, Docker`;

const NO_HEADERS = `just some random text
with no recognizable cv structure
at all`;

describe('CvRuleParserService', () => {
  it('extracts contact info and the name from the first line', () => {
    const { data } = service.parse(CLEAN_CV);
    expect(data.fullName).toBe('Jane Doe');
    expect(data.email).toBe('jane.doe@email.com');
    expect(data.phone).toBe('+1 (415) 555-0132');
    expect(data.links).toEqual(['linkedin.com/in/janedoe']);
  });

  it('detects all three sections and parses entries with date ranges', () => {
    const { data, status } = service.parse(CLEAN_CV);
    expect(status).toBe('parsed');
    expect(data.experience).toHaveLength(2);
    expect(data.experience[0].dateRange).toBe('2021 - Present');
    expect(data.experience[1].dateRange).toBe('2019 - 2021');
    expect(data.experience[0].text).toContain('Senior Developer at Acme Corp');
    expect(data.education).toHaveLength(1);
    expect(data.education[0].dateRange).toBe('2015 - 2019');
    expect(data.skills).toEqual([
      'TypeScript',
      'React',
      'Node.js',
      'PostgreSQL',
      'Docker',
    ]);
  });

  it('marks a CV with no recognizable headers as failed', () => {
    const { status, data } = service.parse(NO_HEADERS);
    expect(status).toBe('failed');
    expect(data.experience).toEqual([]);
    expect(data.skills).toEqual([]);
  });

  it('marks a CV with only some sections as partial and fills only found fields', () => {
    const partial = `John Smith
john@email.com

Skills
Python, AWS, Terraform`;
    const { status, data } = service.parse(partial);
    expect(status).toBe('partial');
    expect(data.skills).toEqual(['Python', 'AWS', 'Terraform']);
    expect(data.experience).toEqual([]);
    expect(data.education).toEqual([]);
  });

  it('fails cleanly on empty text', () => {
    const { status } = service.parse('   ');
    expect(status).toBe('failed');
  });

  it('does not mistake a year range for a phone number', () => {
    const { data } = service.parse(`CV

Experience
Dev at Co
2019 - 2021
Did things`);
    expect(data.phone).toBeUndefined();
    expect(data.experience[0].dateRange).toBe('2019 - 2021');
  });

  // Regression: a French CV whose skills header carries a trailing qualifier.
  // Exact matching missed "Compétences Techniques", so its lines were appended
  // to Experience and Skills came back empty.
  it('routes a qualified French header to its own section', () => {
    const { data, status } = service.parse(`Mohamed Amine Nasfi
medaminenasfy@gmail.com

Expérience
Développeur Full-Stack    Janvier 2026 – Présent
Freelance    À distance

Formation
ESSAT Gabès    2022 – 2025

Compétences Techniques
Front-End : React, Next.js.
Back-End : Node.js, NestJS.`);
    expect(status).toBe('parsed');
    expect(data.experience).toHaveLength(1);
    // Skills text must not have leaked into the experience entry.
    expect(data.experience[0].text).not.toContain('react');
    expect(data.education).toHaveLength(1);
    // The point is that the skills text is non-empty and stayed in Skills.
    expect(data.skills.join(' ')).toContain('React');
  });

  // Accents are dropped on ASCII keyboards and in copy-paste, so both spellings
  // have to name the same section.
  it('matches an accented header typed without accents', () => {
    const { data, status } = service.parse(`Jane Doe

Experience
Dev at Co
2020 - 2022

Competences Techniques
React, Node.js`);
    // No education block, so this is a partial parse by design.
    expect(status).toBe('partial');
    expect(data.skills).toEqual(['React', 'Node.js']);
  });

  it('matches a multi-word header in preference to its own prefix', () => {
    const { data } = service.parse(`Jane Doe

Professional Experience
Dev at Co
2020 - 2022

Skills
React`);
    expect(data.experience).toHaveLength(1);
    expect(data.experience[0].text).toContain('Dev at Co');
    expect(data.skills).toEqual(['React']);
  });

  // The qualifier set is closed deliberately: this guards the rule that keeps a
  // prose line from flipping the current section mid-CV.
  it('does not read a sentence starting with a keyword as a header', () => {
    const { data } = service.parse(`Jane Doe

Experience
Dev at Co
Skills developed during the role include React
2020 - 2022

Skills
Docker`);
    expect(data.experience).toHaveLength(1);
    expect(data.experience[0].text).toContain('Skills developed during the role');
    expect(data.skills).toEqual(['Docker']);
  });

  // 'languages' is both a skills header and the word inside a job bullet; only
  // a short standalone line may open the section.
  it('does not open Skills on a long line that happens to start with a keyword', () => {
    const { data } = service.parse(`Jane Doe

Experience
Dev at Co
Languages: English and French, plus Portuguese
2020 - 2022`);
    expect(data.experience).toHaveLength(1);
    expect(data.experience[0].text).toContain('Portuguese');
    expect(data.skills).toEqual([]);
  });

  it('ignores a trailing colon on a header', () => {
    const { data } = service.parse(`Jane Doe

Experience:
Dev at Co
2020 - 2022

Skills:
Docker`);
    expect(data.experience).toHaveLength(1);
    expect(data.skills).toEqual(['Docker']);
  });

  it('matches a plural French experience header', () => {
    const { data, status } = service.parse(`Jane Doe

Expériences
Dev at Co
2020 - 2022

Compétences
React`);
    expect(status).toBe('partial');
    expect(data.experience).toHaveLength(1);
    expect(data.skills).toEqual(['React']);
  });

  // Regression, found on a real French CV: "Langues" is also a skills keyword,
  // so it opened a second skills block and the technologies listed under
  // "Compétences Techniques" were thrown away.
  it('keeps both blocks when a second header maps to the same section', () => {
    const { data } = service.parse(`Jane Doe

Expérience
Dev at Co
2020 - 2022

Compétences Techniques
Front-End : HTML, CSS, React.

Langues
Anglais    Professionnel`);
    expect(data.experience).toHaveLength(1);
    expect(data.skills).toEqual([
      'Front-End',
      'HTML',
      'CSS',
      'React',
      'Anglais Professionnel',
    ]);
  });

  // A repeated experience header is the same class of bug: the second job
  // replaces the first instead of following it.
  it('keeps entries when a section header appears twice', () => {
    const { data } = service.parse(`Jane Doe

Experience
Dev at Acme
2018 - 2020

Other Experience
Dev at Beta
2020 - 2022`);
    expect(data.experience).toHaveLength(2);
    expect(data.experience[0].text).toContain('Acme');
    expect(data.experience[1].text).toContain('Beta');
  });

  // `-layout` emits column-padded lines; without collapsing, a chip renders as
  // "Anglais<20 spaces>Professionnel".
  it('collapses the column padding that layout mode leaves behind', () => {
    const { data } = service.parse(`Jane Doe

Skills
Anglais                    Professionnel`);
    expect(data.skills).toEqual(['Anglais Professionnel']);
  });

  it('drops the trailing full stop on the last item of a bullet', () => {
    const { data } = service.parse(`Jane Doe

Skills
React, Node.js, Docker.`);
    expect(data.skills).toEqual(['React', 'Node.js', 'Docker']);
  });

  // "-layout" CVs commonly group skills as "Front-End : HTML, CSS". The
  // category label is not a skill, and leaving it attached produces a chip
  // reading "front-end : html".
  it('splits a category label off the skills it introduces', () => {
    const { data } = service.parse(`Jane Doe

Compétences Techniques
Front-End : HTML, CSS, React.
Back-End : Node.js, NestJS.`);
    expect(data.skills).toEqual([
      'Front-End',
      'HTML',
      'CSS',
      'React',
      'Back-End',
      'Node.js',
      'NestJS',
    ]);
  });

  // Collapsing must not eat a dotted version number or a decimal.
  it('keeps periods that are part of a name', () => {
    const { data } = service.parse(`Jane Doe

Skills
Node.js, Express.js, v1.0`);
    expect(data.skills).toEqual(['Node.js', 'Express.js', 'v1.0']);
  });

  // Regression, found on a real uploaded CV: pdftotext wraps paragraphs at the
  // column edge, so one bullet arrived as three lines and the CV builder
  // printed every fragment on its own row. Continuation lines (lowercase
  // start) must be glued back to the line they belong to.
  it('folds wrapped lines of an entry back together', () => {
    const { data } = service.parse(`Mohamed Amine Nasfi

Expérience
Technicien Support IT --- Freelance Mai 2026 -- Présent
Cabinet d'Orthodontie Dr Meriem Nasfi Gabès, Tunisie
Maintenance préventive et corrective de postes de travail sous Windows :
diagnostic de pannes matérielles/logicielles, montage
et mise en service, installation de logiciels et périphériques.

Compétences Techniques
Matériel & Maintenance: Montage et mise en service de postes de travail,
diagnostic de pannes, maintenance préventive/corrective.`);
    expect(data.experience).toHaveLength(1);
    expect(data.experience[0].text).toBe(
      [
        'Technicien Support IT --- Freelance Mai 2026 -- Présent',
        "Cabinet d'Orthodontie Dr Meriem Nasfi Gabès, Tunisie",
        'Maintenance préventive et corrective de postes de travail sous Windows : ' +
          'diagnostic de pannes matérielles/logicielles, montage ' +
          'et mise en service, installation de logiciels et périphériques.',
      ].join('\n'),
    );
    // A wrapped skills bullet stays one chip, in its original case.
    expect(data.skills).toEqual([
      'Matériel & Maintenance',
      'Montage et mise en service de postes de travail',
      'diagnostic de pannes',
      'maintenance préventive/corrective',
    ]);
  });

  // Bullet markers open a new line even mid-paragraph: folding must not glue a
  // bullet onto the line above it.
  // Bullets start a new entry (parseEntries splits at a bullet marker), while a
  // bullet's own soft-wrapped tail folds back onto it.
  it('keeps bullet lines separate while folding their wraps', () => {
    const { data } = service.parse(`Jane Doe

Experience
Dev at Acme 2020 - 2022
• Built the billing service,
  including retries and idempotency keys.
• Shipped the admin dashboard.`);
    expect(data.experience).toHaveLength(3);
    expect(data.experience[0].text).toBe('Dev at Acme 2020 - 2022');
    expect(data.experience[1].text).toBe(
      'Built the billing service, including retries and idempotency keys.',
    );
    expect(data.experience[2].text).toBe('Shipped the admin dashboard.');
  });
});
