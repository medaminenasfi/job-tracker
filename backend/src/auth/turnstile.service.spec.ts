import { TurnstileService } from './turnstile.service';

// Mocks the Cloudflare siteverify call so the service logic is tested without a
// live network dependency (AGENTS.md §22/§23: mock external services in tests).
function mockFetch(impl: () => Promise<unknown>) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(impl as unknown as typeof fetch);
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

describe('TurnstileService', () => {
  let service: TurnstileService;
  const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY;
  const ORIGINAL_HOSTNAMES = process.env.TURNSTILE_ALLOWED_HOSTNAMES;

  beforeEach(() => {
    service = new TurnstileService();
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    delete process.env.TURNSTILE_ALLOWED_HOSTNAMES;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = ORIGINAL_SECRET;
    if (ORIGINAL_HOSTNAMES === undefined)
      delete process.env.TURNSTILE_ALLOWED_HOSTNAMES;
    else process.env.TURNSTILE_ALLOWED_HOSTNAMES = ORIGINAL_HOSTNAMES;
  });

  it('returns success when Cloudflare reports success', async () => {
    mockFetch(() => jsonResponse({ success: true }));
    await expect(service.verify('valid-token')).resolves.toEqual({
      success: true,
    });
  });

  it('sends secret, response and remoteip in the siteverify body', async () => {
    const spy = mockFetch(() => jsonResponse({ success: true }));
    await service.verify('tok', '1.2.3.4', 'login');
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    const params = init.body as URLSearchParams;
    expect(params.get('secret')).toBe('test-secret');
    expect(params.get('response')).toBe('tok');
    expect(params.get('remoteip')).toBe('1.2.3.4');
  });

  it('rejects with 400 when Cloudflare reports success:false', async () => {
    mockFetch(() =>
      jsonResponse({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    );
    await expect(service.verify('bad-token')).resolves.toEqual({
      success: false,
      status: 400,
      detail: 'invalid-input-response',
    });
  });

  it('rejects with 400 when the action does not match', async () => {
    mockFetch(() => jsonResponse({ success: true, action: 'register' }));
    await expect(service.verify('tok', undefined, 'login')).resolves.toEqual({
      success: false,
      status: 400,
      detail: 'action-mismatch',
    });
  });

  it('accepts when the action matches', async () => {
    mockFetch(() => jsonResponse({ success: true, action: 'login' }));
    await expect(service.verify('tok', undefined, 'login')).resolves.toEqual({
      success: true,
    });
  });

  // Cloudflare's public "always passes" test keys return success with NO action
  // field (their dummy token carries none). An expectedAction must still pass in
  // that case, otherwise every dev login/register would be rejected.
  it('accepts when Cloudflare omits the action (test keys)', async () => {
    mockFetch(() => jsonResponse({ success: true }));
    await expect(
      service.verify('XXXX.DUMMY.TOKEN', undefined, 'login'),
    ).resolves.toEqual({ success: true });
  });

  it('rejects with 400 when the hostname is not allowed', async () => {
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = 'app.example.com';
    mockFetch(() => jsonResponse({ success: true, hostname: 'evil.com' }));
    await expect(service.verify('tok')).resolves.toEqual({
      success: false,
      status: 400,
      detail: 'hostname-mismatch',
    });
  });

  it('rejects a missing token with 400 without calling Cloudflare', async () => {
    const spy = mockFetch(() => jsonResponse({ success: true }));
    await expect(service.verify(undefined)).resolves.toEqual({
      success: false,
      status: 400,
      detail: 'missing-input-response',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an oversized token with 400 without calling Cloudflare', async () => {
    const spy = mockFetch(() => jsonResponse({ success: true }));
    await expect(service.verify('x'.repeat(2049))).resolves.toEqual({
      success: false,
      status: 400,
      detail: 'missing-input-response',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the secret is not configured', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const spy = mockFetch(() => jsonResponse({ success: true }));
    await expect(service.verify('tok')).resolves.toEqual({
      success: false,
      status: 503,
      detail: 'turnstile-not-configured',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when siteverify times out / throws', async () => {
    mockFetch(() => Promise.reject(new Error('The operation was aborted')));
    await expect(service.verify('tok')).resolves.toEqual({
      success: false,
      status: 503,
      detail: 'timeout-or-network-error',
    });
  });

  it('fails closed with 503 when siteverify returns a non-2xx status', async () => {
    mockFetch(() => jsonResponse({}, false, 502));
    await expect(service.verify('tok')).resolves.toEqual({
      success: false,
      status: 503,
      detail: 'siteverify-http-error',
    });
  });
});
