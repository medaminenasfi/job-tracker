import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LatexBuildService } from './latex-build.service';
import type { DbService } from '../db/db.service';
import type { LatexCompilerService } from './latex-compiler.service';

// Storage writes are not what these tests are about.
jest.mock('fs/promises', () => {
  const actual =
    jest.requireActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
  };
});

const TEMPLATE_ID = '11111111-1111-4111-8111-111111111111';

describe('LatexBuildService', () => {
  let db: { query: jest.Mock };
  let compiler: { compile: jest.Mock; assertAvailable: jest.Mock };
  let service: LatexBuildService;

  // Query arguments, typed so assertions can read them without `any`.
  function callsContaining(fragment: string): unknown[][] {
    return (db.query.mock.calls as unknown[][]).filter(
      (call) => typeof call[0] === 'string' && call[0].includes(fragment),
    );
  }

  beforeEach(() => {
    db = { query: jest.fn() };
    compiler = {
      compile: jest.fn(),
      assertAvailable: jest.fn().mockResolvedValue(undefined),
    };
    service = new LatexBuildService(
      db as unknown as DbService,
      compiler as unknown as LatexCompilerService,
    );
  });

  function mockQueries(options: { template?: boolean } = {}) {
    db.query.mockImplementation((sql: string, values?: unknown[]) => {
      if (sql.includes('FROM cv_templates')) {
        return Promise.resolve({
          rows:
            options.template === false
              ? []
              : [
                  {
                    id: TEMPLATE_ID,
                    name: 'Classic',
                    latex_source: '{{fullName}}',
                  },
                ],
        });
      }
      if (sql.startsWith('INSERT INTO generated_cvs')) {
        // Echo the stored field values back, like Postgres would.
        const raw = values?.[3];
        const fields = (
          typeof raw === 'string' ? JSON.parse(raw) : {}
        ) as Record<string, string>;
        return Promise.resolve({
          rows: [
            {
              id: 'g1',
              user_id: 'u1',
              template_id: TEMPLATE_ID,
              field_values: fields,
              pdf_url: null,
              status: 'queued',
              error_message: null,
              created_at: '2026-10-04T00:00:00Z',
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  }

  it('queues a build and compiles it in the background', async () => {
    mockQueries();
    compiler.compile.mockResolvedValue({
      ok: true,
      pdf: Buffer.from('%PDF-1'),
    });

    const row = await service.create('u1', {
      template_id: TEMPLATE_ID,
      fields: { fullName: 'Ada' },
    });
    expect(row.status).toBe('queued');

    // The compile runs off the request path; wait for the chain to settle.
    await new Promise((resolve) => setImmediate(resolve));
    expect(compiler.compile).toHaveBeenCalledWith('{{fullName}}', {
      fullName: 'Ada',
    });
  });

  it('refuses to queue a build when no sandbox is available', async () => {
    mockQueries();
    compiler.assertAvailable.mockRejectedValue(
      new ServiceUnavailableException('PDF generation is not available'),
    );
    await expect(
      service.create('u1', { template_id: TEMPLATE_ID, fields: {} }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.query).not.toHaveBeenCalled();
    expect(compiler.compile).not.toHaveBeenCalled();
  });

  it('stores a generic error message when compilation fails', async () => {
    mockQueries();
    compiler.compile.mockResolvedValue({ ok: false, reason: 'compile_failed' });

    await service.create('u1', { template_id: TEMPLATE_ID, fields: {} });
    await new Promise((resolve) => setImmediate(resolve));

    const statusCalls = callsContaining('UPDATE generated_cvs SET status');
    expect(statusCalls.at(-1)?.[1]).toEqual([
      'failed',
      'The template could not be compiled.',
      'g1',
      'u1',
    ]);
    // No compiler internals ever reach the user-facing record.
    expect(JSON.stringify(statusCalls)).not.toContain('pdflatex');
  });

  it('marks the build ready and stores its pdf_url', async () => {
    mockQueries();
    compiler.compile.mockResolvedValue({
      ok: true,
      pdf: Buffer.from('%PDF-1'),
    });

    await service.create('u1', { template_id: TEMPLATE_ID, fields: {} });
    await new Promise((resolve) => setImmediate(resolve));

    const readyCall = callsContaining("SET status = 'ready'").at(0);
    expect(readyCall?.[1]).toEqual(['/api/cvs/build/g1/file', 'g1', 'u1']);
  });

  it('adds a ready build to the CV list as a generated CV', async () => {
    mockQueries();
    compiler.compile.mockResolvedValue({
      ok: true,
      pdf: Buffer.from('%PDF-1'),
    });

    await service.create('u1', {
      template_id: TEMPLATE_ID,
      fields: {
        fullName: 'Ada',
        email: 'ada@example.com',
        experience: 'Engineer at ACME',
        skills: 'TypeScript,  Docker ',
      },
    });
    await new Promise((resolve) => setImmediate(resolve));

    const insert = callsContaining('INSERT INTO cvs').at(0);
    const [id, userId, label, fileUrl, data] = insert?.[1] as string[];
    // Same id as the build: the compiled PDF is served straight from
    // uploads/generated/<id>.pdf, so no extra link column is needed.
    expect(id).toBe('g1');
    expect(userId).toBe('u1');
    expect(label).toBe('Classic — generated CV');
    expect(fileUrl).toBe('/api/cvs/build/g1/file');
    expect(JSON.parse(data)).toEqual({
      fullName: 'Ada',
      email: 'ada@example.com',
      phone: undefined,
      experience: [{ text: 'Engineer at ACME' }],
      education: [],
      skills: ['TypeScript', 'Docker'],
    });
  });

  it('does not add a failed build to the CV list', async () => {
    mockQueries();
    compiler.compile.mockResolvedValue({ ok: false, reason: 'timeout' });

    await service.create('u1', { template_id: TEMPLATE_ID, fields: {} });
    await new Promise((resolve) => setImmediate(resolve));

    expect(callsContaining('INSERT INTO cvs')).toHaveLength(0);
  });

  it('lists only active templates and never their LaTeX source', async () => {
    db.query.mockResolvedValue({
      rows: [{ id: TEMPLATE_ID, name: 'Classic', language: 'en' }],
    });

    await expect(service.listActiveTemplates()).resolves.toEqual([
      { id: TEMPLATE_ID, name: 'Classic', language: 'en' },
    ]);
    const [sql] = (db.query.mock.calls as unknown[][])[0] as [string];
    expect(sql).toContain('is_active = true');
    expect(sql).not.toContain('latex_source');
  });

  it('rejects an unknown or inactive template', async () => {
    mockQueries({ template: false });
    await expect(
      service.create('u1', { template_id: TEMPLATE_ID, fields: {} }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(compiler.compile).not.toHaveBeenCalled();
  });

  it('rejects invalid input and unknown field names', async () => {
    await expect(
      service.create('u1', { template_id: 'not-a-uuid', fields: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('u1', {
        template_id: TEMPLATE_ID,
        fields: { evil: 'x' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(compiler.compile).not.toHaveBeenCalled();
  });

  it('never lets one user read another user build', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(service.findOne('u2', 'g1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const [sql, values] = (db.query.mock.calls as unknown[][])[0] as [
      string,
      unknown[],
    ];
    expect(sql).toContain('user_id = $2');
    expect(values).toEqual(['g1', 'u2']);
  });

  it('deletes only the owner build and its stored PDF', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'g1' }] });
    db.query.mockResolvedValue({ rows: [], rowCount: 1 });
    await expect(service.remove('u1', 'g1')).resolves.toEqual({
      deleted: true,
    });
    expect(db.query).toHaveBeenCalledWith(
      'DELETE FROM generated_cvs WHERE id = $1 AND user_id = $2',
      ['g1', 'u1'],
    );
    // The generated CV in the unified list is removed with it.
    expect(db.query).toHaveBeenCalledWith(
      'DELETE FROM cvs WHERE id = $1 AND user_id = $2',
      ['g1', 'u1'],
    );
  });

  it('fails builds left in flight by a previous process', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await service.onModuleInit();
    expect(
      callsContaining("WHERE status IN ('queued', 'compiling')"),
    ).toHaveLength(1);
  });
});
