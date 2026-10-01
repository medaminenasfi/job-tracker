import { JobsRepository } from './jobs.repository';

describe('JobsRepository.update', () => {
  let query: jest.Mock;
  let repo: JobsRepository;

  beforeEach(() => {
    query = jest.fn();
    repo = new JobsRepository({ query } as never);
  });

  it('binds user_id and id to the correct trailing placeholders', async () => {
    query.mockResolvedValue({ rows: [{ id: 'job-1' }] });

    await repo.update('user-1', 'job-1', { title: 'Eng', notes: 'hi' });

    const [sql, values] = query.mock.calls[0];
    // 2 fields + updated_at = $1..$3, then user_id=$4, id=$5
    expect(sql).toContain('WHERE user_id = $4 AND id = $5');
    expect(values).toEqual(['Eng', 'hi', expect.any(Date), 'user-1', 'job-1']);
  });

  it('never interpolates non-whitelisted or malicious keys into SQL', async () => {
    query.mockResolvedValue({ rows: [{ id: 'job-1' }] });

    await repo.update('user-1', 'job-1', {
      title: 'Eng',
      user_id: 'attacker',
      applied_at: new Date(0),
      'title = $1; DROP TABLE jobs; --': 'x',
    });

    const [sql, values] = query.mock.calls[0];
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('user_id = $1');
    expect(sql).not.toContain('applied_at');
    // only the whitelisted 'title' is set; user_id/applied_at/injection dropped
    expect(sql).toContain('SET title = $1, updated_at = $2');
    expect(values).toEqual(['Eng', expect.any(Date), 'user-1', 'job-1']);
  });

  it('falls back to findOne when no updatable fields are provided', async () => {
    query.mockResolvedValue({ rows: [{ id: 'job-1' }] });

    await repo.update('user-1', 'job-1', { user_id: 'attacker', id: 'x' });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain('SELECT * FROM jobs WHERE user_id = $1 AND id = $2');
  });

  it('normalizes an empty url to null on update', async () => {
    query.mockResolvedValue({ rows: [{ id: 'job-1' }] });

    await repo.update('user-1', 'job-1', { url: '  ' });

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('SET url = $1');
    expect(values[0]).toBeNull();
  });
});

describe('JobsRepository.create', () => {
  let query: jest.Mock;
  let repo: JobsRepository;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue({ rows: [{ id: 'job-1' }] });
    repo = new JobsRepository({ query } as never);
  });

  it('is idempotent on (user_id, url) to prevent duplicate saves', async () => {
    await repo.create('user-1', {
      title: 'Eng',
      company: 'Acme',
      url: 'https://s/1',
    });
    const [sql] = query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (user_id, url) WHERE url IS NOT NULL');
    expect(sql).toContain('DO UPDATE SET updated_at = now()');
  });

  it('coerces missing optional fields to null', async () => {
    await repo.create('user-1', { title: 'Eng', company: 'Acme' });
    const [, values] = query.mock.calls[0];
    // [user_id, title, company, location, url, source, description, salary, employment_type, status, notes]
    expect(values).toEqual([
      'user-1',
      'Eng',
      'Acme',
      null,
      null,
      null,
      null,
      null,
      null,
      'SAVED',
      null,
    ]);
  });

  it('normalizes an empty or whitespace url to null so url-less entries do not collide', async () => {
    await repo.create('user-1', { title: 'A', company: 'X', url: '' });
    expect(query.mock.calls[0][1][4]).toBeNull();

    query.mockClear();
    await repo.create('user-1', { title: 'B', company: 'X', url: '   ' });
    expect(query.mock.calls[0][1][4]).toBeNull();
  });

  it('trims a real url but keeps it', async () => {
    await repo.create('user-1', {
      title: 'A',
      company: 'X',
      url: '  https://s/1  ',
    });
    expect(query.mock.calls[0][1][4]).toBe('https://s/1');
  });
});

describe('JobsRepository per-user scoping', () => {
  let query: jest.Mock;
  let repo: JobsRepository;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue({ rows: [{ id: 'job-1' }] });
    repo = new JobsRepository({ query } as never);
  });

  it('findOne filters by both user_id and id', async () => {
    await repo.findOne('user-B', 'job-1');
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('WHERE user_id = $1 AND id = $2');
    expect(values).toEqual(['user-B', 'job-1']);
  });

  it('updateStatus filters by user_id and sets applied_at only for APPLIED', async () => {
    await repo.updateStatus('user-B', 'job-1', 'APPLIED');
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('applied_at = $3');
    expect(sql).toContain('WHERE user_id = $4 AND id = $5');
    expect(values[3]).toBe('user-B');
    expect(values[4]).toBe('job-1');
  });

  it("delete filters by user_id so one user cannot delete another's job", async () => {
    await repo.delete('user-B', 'job-1');
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('DELETE FROM jobs WHERE user_id = $1 AND id = $2');
    expect(values).toEqual(['user-B', 'job-1']);
  });

  it('findAll filters by user_id', async () => {
    await repo.findAll('user-B');
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('WHERE user_id = $1');
    expect(values).toEqual(['user-B']);
  });

  it('findAll appends status/source/search filters after user_id', async () => {
    await repo.findAll('user-B', {
      status: 'APPLIED',
      source: 'linkedin',
      search: 'acme',
    });
    const [sql, values] = query.mock.calls[0];
    // user_id stays $1; filters are $2/$3/$4 (search reused for all three columns)
    expect(sql).toContain('WHERE user_id = $1 AND status = $2 AND source = $3');
    expect(sql).toContain(
      '(title ILIKE $4 OR company ILIKE $4 OR location ILIKE $4)',
    );
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(values).toEqual(['user-B', 'APPLIED', 'linkedin', '%acme%']);
  });

  it('findAll never lets a filter displace user_id scoping', async () => {
    await repo.findAll('user-B', { search: "'; DROP TABLE jobs; --" });
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('WHERE user_id = $1');
    expect(sql).not.toContain('DROP TABLE');
    // the malicious string is bound as a parameter, not interpolated
    expect(values).toEqual(['user-B', "%'; DROP TABLE jobs; --%"]);
  });
});
