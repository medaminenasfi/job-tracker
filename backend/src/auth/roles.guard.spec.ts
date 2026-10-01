import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

function contextWithUser(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextWithUser({ id: 'u', role: 'USER' }))).toBe(
      true,
    );
  });

  it('allows a user whose DB-loaded role matches the requirement', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(guard.canActivate(contextWithUser({ id: 'u', role: 'ADMIN' }))).toBe(
      true,
    );
  });

  it('rejects a non-admin hitting an ADMIN route with 403', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() =>
      guard.canActivate(contextWithUser({ id: 'u', role: 'USER' })),
    ).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('reads the required roles via the shared ROLES_KEY metadata', () => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(undefined);
    const ctx = contextWithUser({ id: 'u', role: 'USER' });
    guard.canActivate(ctx);
    expect(spy).toHaveBeenCalledWith(ROLES_KEY, [undefined, undefined]);
  });
});
