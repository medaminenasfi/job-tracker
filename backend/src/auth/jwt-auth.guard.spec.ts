jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class {
      canActivate() {
        return true;
      }
    },
}));

import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  it('is a constructable Passport JWT guard', () => {
    const guard = new JwtAuthGuard();
    expect(guard).toBeDefined();
  });
});
