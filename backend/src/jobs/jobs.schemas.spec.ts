import {
  createJobSchema,
  updateJobSchema,
  jobStatusSchema,
} from './jobs.schemas';

describe('createJobSchema', () => {
  it('accepts a valid job and trims text', () => {
    const result = createJobSchema.safeParse({
      title: '  Engineer  ',
      company: ' Acme ',
      location: 'Berlin',
      url: 'https://site.com/job/1',
      source: 'linkedin',
      status: 'APPLIED',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Engineer');
      expect(result.data.company).toBe('Acme');
    }
  });

  it('converts empty optional strings to undefined (web form submits "")', () => {
    const result = createJobSchema.safeParse({
      title: 'Engineer',
      company: 'Acme',
      location: '',
      url: '',
      salary: '',
      notes: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location).toBeUndefined();
      expect(result.data.url).toBeUndefined();
    }
  });

  it('rejects a missing title or company', () => {
    expect(createJobSchema.safeParse({ company: 'Acme' }).success).toBe(false);
    expect(createJobSchema.safeParse({ title: 'Eng' }).success).toBe(false);
    expect(createJobSchema.safeParse({ title: '', company: '' }).success).toBe(
      false,
    );
  });

  it('rejects an invalid url/source but allows a configured custom status name', () => {
    expect(
      createJobSchema.safeParse({ title: 'T', company: 'C', url: 'not-a-url' })
        .success,
    ).toBe(false);
    expect(
      createJobSchema.safeParse({ title: 'T', company: 'C', source: 'monster' })
        .success,
    ).toBe(false);
    expect(
      createJobSchema.safeParse({ title: 'T', company: 'C', status: 'HIRED' })
        .success,
    ).toBe(true);
  });

  it('strips unknown keys so they cannot reach the DB', () => {
    const result = createJobSchema.safeParse({
      title: 'T',
      company: 'C',
      user_id: 'attacker',
      applied_at: new Date(0),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('user_id');
      expect(result.data).not.toHaveProperty('applied_at');
    }
  });
});

describe('updateJobSchema', () => {
  it('allows a partial update', () => {
    const result = updateJobSchema.safeParse({ notes: 'follow up' });
    expect(result.success).toBe(true);
  });

  it('accepts custom status names on patch but rejects blank values', () => {
    expect(updateJobSchema.safeParse({ status: 'Phone screen' }).success).toBe(
      true,
    );
    expect(updateJobSchema.safeParse({ status: ' ' }).success).toBe(false);
  });

  it('turns an empty note into null so a note can be deleted', () => {
    const result = updateJobSchema.safeParse({ notes: '   ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.notes).toBeNull();
  });

  it('omits notes entirely when the key is not sent (leave unchanged)', () => {
    const result = updateJobSchema.safeParse({ status: 'APPLIED' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('notes');
  });

  it('keeps a non-empty note trimmed', () => {
    const result = updateJobSchema.safeParse({ notes: '  call recruiter  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.notes).toBe('call recruiter');
  });
});

describe('jobStatusSchema', () => {
  it('accepts default and custom names but rejects blanks', () => {
    for (const status of [
      'SAVED',
      'APPLIED',
      'ACCEPTED',
      'INTERVIEW',
      'OFFER',
      'REJECTED',
      'WITHDRAWN',
    ]) {
      expect(jobStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(jobStatusSchema.safeParse('Phone screen').success).toBe(true);
    expect(jobStatusSchema.safeParse(' ').success).toBe(false);
  });
});
