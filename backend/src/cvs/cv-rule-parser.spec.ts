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
      'typescript',
      'react',
      'node.js',
      'postgresql',
      'docker',
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
    expect(data.skills).toEqual(['python', 'aws', 'terraform']);
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
});
