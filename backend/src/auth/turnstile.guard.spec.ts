import {
  BadRequestException,
  ServiceUnavailableException,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TurnstileGuard } from './turnstile.guard';
import { TurnstileService } from './turnstile.service';

function contextWithBody(
  body: unknown,
  headers: Record<string, string> = {},
): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ body, headers, ip: '9.9.9.9' }),
    }),
  } as unknown as ExecutionContext;
}

describe('TurnstileGuard', () => {
  let reflector: Reflector;
  let service: { verify: jest.Mock };
  let guard: TurnstileGuard;

  beforeEach(() => {
    reflector = new Reflector();
    service = { verify: jest.fn() };
    guard = new TurnstileGuard(
      reflector,
      service as unknown as TurnstileService,
    );
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('login');
  });

  it('allows the request when verification succeeds', async () => {
    service.verify.mockResolvedValue({ success: true });
    await expect(
      guard.canActivate(contextWithBody({ turnstileToken: 'tok' })),
    ).resolves.toBe(true);
  });

  it('passes the token, first forwarded IP and expected action to the service', async () => {
    service.verify.mockResolvedValue({ success: true });
    await guard.canActivate(
      contextWithBody(
        { turnstileToken: 'tok' },
        { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
      ),
    );
    expect(service.verify).toHaveBeenCalledWith('tok', '1.2.3.4', 'login');
  });

  it('falls back to the socket IP when x-forwarded-for is absent', async () => {
    service.verify.mockResolvedValue({ success: true });
    await guard.canActivate(contextWithBody({ turnstileToken: 'tok' }));
    expect(service.verify).toHaveBeenCalledWith('tok', '9.9.9.9', 'login');
  });

  it('throws 400 when the token is invalid', async () => {
    service.verify.mockResolvedValue({
      success: false,
      status: 400,
      detail: 'invalid-input-response',
    });
    await expect(
      guard.canActivate(contextWithBody({ turnstileToken: 'bad' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws 503 (fail closed) when the CAPTCHA service is unavailable', async () => {
    service.verify.mockResolvedValue({
      success: false,
      status: 503,
      detail: 'timeout-or-network-error',
    });
    await expect(
      guard.canActivate(contextWithBody({ turnstileToken: 'tok' })),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('reads the token from the request body (undefined when absent)', async () => {
    service.verify.mockResolvedValue({ success: true });
    await guard.canActivate(contextWithBody({}));
    expect(service.verify).toHaveBeenCalledWith(undefined, '9.9.9.9', 'login');
  });
});
