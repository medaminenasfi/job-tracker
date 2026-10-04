import { Test } from '@nestjs/testing';
import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { AiService } from './ai.service';
import { DbService } from '../db/db.service';
import { pingResultSchema } from './ai.schemas';

describe('AiService', () => {
  let service: AiService;
  let db: { query: jest.Mock };

  beforeEach(async () => {
    db = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [AiService, { provide: DbService, useValue: db }],
    }).compile();
    service = module.get(AiService);
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.AI_MONTHLY_CALL_CAP = '3';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_MONTHLY_CALL_CAP;
  });

  function mockFetchJson(payload: unknown, ok = true, status = 200) {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok,
      status,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: JSON.stringify(payload) } }],
        }),
    } as Response);
  }

  it('returns Zod-validated ping result', async () => {
    mockFetchJson({ ok: true, echo: 'hi' });
    const result = await service.completeJson(
      [{ role: 'user', content: 'hi' }],
      pingResultSchema,
    );
    expect(result).toEqual({ ok: true, echo: 'hi' });
  });

  it('retries a rate-limited provider call', async () => {
    let calls = 0;
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve({ ok: false, status: 429 } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: { content: JSON.stringify({ ok: true, echo: 'hi' }) },
              },
            ],
          }),
      } as Response);
    });
    const result = await service.completeJson(
      [{ role: 'user', content: 'hi' }],
      pingResultSchema,
    );
    expect(result).toEqual({ ok: true, echo: 'hi' });
    expect(calls).toBe(2);
  });

  it('rejects output that fails Zod validation', async () => {
    mockFetchJson({ ok: 'yes' });
    await expect(
      service.completeJson([{ role: 'user', content: 'hi' }], pingResultSchema),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects invalid JSON from the model', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ choices: [{ message: { content: 'not json' } }] }),
    } as Response);
    await expect(
      service.completeJson([{ role: 'user', content: 'hi' }], pingResultSchema),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails closed when the provider errors', async () => {
    mockFetchJson({}, false, 500);
    await expect(
      service.completeJson([{ role: 'user', content: 'hi' }], pingResultSchema),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  // Regression: a timeout while streaming the response body used to escape as a
  // raw DOMException and surface as an unhandled 500 ("socket hang up").
  it('turns a timeout while reading the response body into a 504', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.reject(
          Object.assign(new Error('The operation was aborted due to timeout'), {
            name: 'TimeoutError',
          }),
        ),
    } as Response);

    await expect(
      service.completeJson([{ role: 'user', content: 'hi' }], pingResultSchema),
    ).rejects.toMatchObject({ status: HttpStatus.GATEWAY_TIMEOUT });
  });

  it('retries a timed-out request and succeeds', async () => {
    let calls = 0;
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      calls++;
      if (calls === 1) {
        return Promise.reject(
          Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
        );
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: { content: JSON.stringify({ ok: true, echo: 'hi' }) },
              },
            ],
          }),
      } as Response);
    });

    const result = await service.completeJson(
      [{ role: 'user', content: 'hi' }],
      pingResultSchema,
    );
    expect(result).toEqual({ ok: true, echo: 'hi' });
    expect(calls).toBe(2);
  });

  it('gives up with 504 after repeated timeouts', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.reject(
          Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
        ),
      );
    await expect(
      service.completeJson([{ role: 'user', content: 'hi' }], pingResultSchema),
    ).rejects.toMatchObject({ status: HttpStatus.GATEWAY_TIMEOUT });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('blocks when the monthly cap is reached', async () => {
    db.query.mockResolvedValue({
      rows: [{ ai_calls_this_month: 3, ai_calls_reset_at: new Date() }],
    });
    await expect(service.enforceMonthlyCap('u1')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('allows calls under the monthly cap', async () => {
    db.query.mockResolvedValue({
      rows: [{ ai_calls_this_month: 1, ai_calls_reset_at: new Date() }],
    });
    await expect(service.enforceMonthlyCap('u1')).resolves.toBeUndefined();
  });

  it('resets the counter window when the reset timestamp is stale', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          ai_calls_this_month: 99,
          ai_calls_reset_at: new Date(Date.now() - 31 * 24 * 3600 * 1000),
        },
      ],
    });
    await expect(service.enforceMonthlyCap('u1')).resolves.toBeUndefined();
  });
});
