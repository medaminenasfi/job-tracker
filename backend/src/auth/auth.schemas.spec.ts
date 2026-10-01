import { loginSchema, registerSchema } from './auth.schemas';

describe('auth schemas', () => {
  it('accepts a valid register payload', () => {
    const parsed = registerSchema.parse({
      name: ' Ada ',
      email: 'Ada@Example.com',
      password: 'secret1',
    });
    expect(parsed).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'secret1',
    });
  });

  it('rejects a short password', () => {
    const result = registerSchema.safeParse({
      name: 'Ada',
      email: 'ada@example.com',
      password: '123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid login emails', () => {
    const result = loginSchema.safeParse({
      email: 'nope',
      password: 'secret1',
    });
    expect(result.success).toBe(false);
  });
});
