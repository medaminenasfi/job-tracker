import { createJobSchema, updateJobSchema, jobStatusSchema } from './jobs.schemas';

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
    expect(createJobSchema.safeParse({ title: '', company: '' }).success).toBe(false);
  });

  it('rejects an invalid url, source and status', () => {
    expect(createJobSchema.safeParse({ title: 'T', company: 'C', url: 'not-a-url' }).success).toBe(false);
    expect(createJobSchema.safeParse({ title: 'T', company: 'C', source: 'monster' }).success).toBe(false);
    expect(createJobSchema.safeParse({ title: 'T', company: 'C', status: 'HIRED' }).success).toBe(false);
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

  it('still rejects an invalid status on patch', () => {
    expect(updateJobSchema.safeParse({ status: 'NOPE' }).success).toBe(false);
  });
});

describe('jobStatusSchema', () => {
  it('accepts every Kanban column and rejects others', () => {
    for (const status of ['SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN']) {
      expect(jobStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(jobStatusSchema.safeParse('applied').success).toBe(false);
  });
});
