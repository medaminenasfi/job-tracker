import { GoogleAuthService } from './google-auth.service';
import type { Profile } from 'passport-google-oauth20';

// Builds a minimal Passport Google profile for the cases we care about.
function makeProfile(over: {
  id?: string;
  email?: string | null;
  verified?: boolean;
  displayName?: string;
  account_status?: string;
} = {}): Profile {
  const email = over.email === undefined ? 'jane@example.com' : over.email;
  return {
    id: over.id ?? 'google-123',
    displayName: over.displayName ?? 'Jane Doe',
    emails: email ? [{ value: email, verified: over.verified ?? true }] : [],
    photos: [{ value: 'https://avatar.example/p.png' }],
    _json: {
      email: email ?? undefined,
      email_verified: over.verified ?? true,
      picture: 'https://avatar.example/p.png',
    },
  } as unknown as Profile;
}

describe('GoogleAuthService', () => {
  let query: jest.Mock;
  let service: GoogleAuthService;

  beforeEach(() => {
    query = jest.fn();
    service = new GoogleAuthService({ query } as never);
  });

  it('signs in an account already linked to this google_id', async () => {
    query
      // SELECT by google_id
      .mockResolvedValueOnce({
        rows: [{ id: 'u1', role: 'USER', account_status: 'ACTIVE' }],
      })
      // UPDATE last_login_at (from finalize)
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.handleGoogleUser(makeProfile());

    expect(result).toEqual({ id: 'u1', role: 'USER' });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('WHERE google_id');
  });

  it('links an existing local account when the Google email is verified', async () => {
    query
      // SELECT by google_id -> none
      .mockResolvedValueOnce({ rows: [] })
      // SELECT by email -> existing local user
      .mockResolvedValueOnce({
        rows: [{ id: 'u2', role: 'USER', account_status: 'ACTIVE', google_id: null }],
      })
      // UPDATE google_id (link)
      .mockResolvedValueOnce({ rows: [] })
      // UPDATE last_login_at
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.handleGoogleUser(
      makeProfile({ email: 'local@example.com', verified: true }),
    );

    expect(result).toEqual({ id: 'u2', role: 'USER' });
    // The link UPDATE must set google_id on the existing row (no new user created).
    expect(query.mock.calls[2][0]).toContain('UPDATE users SET google_id');
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('refuses to link an existing account when the Google email is NOT verified', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // by google_id
      .mockResolvedValueOnce({
        rows: [{ id: 'u2', role: 'USER', account_status: 'ACTIVE', google_id: null }],
      }); // by email

    const result = await service.handleGoogleUser(
      makeProfile({ email: 'local@example.com', verified: false }),
    );

    expect(result).toEqual({ blocked: 'email_not_verified' });
    // No link UPDATE, no last_login update.
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('creates a new Google-only USER (role USER, no password) for a verified new email', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // by google_id
      .mockResolvedValueOnce({ rows: [] }) // by email
      // INSERT ... RETURNING
      .mockResolvedValueOnce({
        rows: [{ id: 'u3', role: 'USER', account_status: 'ACTIVE' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // last_login_at

    const result = await service.handleGoogleUser(
      makeProfile({ email: 'brandnew@example.com', verified: true }),
    );

    expect(result).toEqual({ id: 'u3', role: 'USER' });
    const insert = query.mock.calls[2];
    expect(insert[0]).toContain('INSERT INTO users');
    // password_hash must be NULL and role forced to USER for Google signups.
    expect(insert[0]).toContain("NULL, 'USER'");
    expect(insert[0]).toContain("'google'");
  });

  it('does not create an account for an unverified new email', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // by google_id
      .mockResolvedValueOnce({ rows: [] }); // by email

    const result = await service.handleGoogleUser(
      makeProfile({ email: 'new@example.com', verified: false }),
    );

    expect(result).toEqual({ blocked: 'email_not_verified' });
    expect(query).toHaveBeenCalledTimes(2); // no INSERT
  });

  it('refuses a suspended account even with a matching google_id', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'u4', role: 'USER', account_status: 'SUSPENDED' }],
    });

    const result = await service.handleGoogleUser(makeProfile());

    expect(result).toEqual({ blocked: 'suspended' });
    expect(query).toHaveBeenCalledTimes(1); // no last_login update
  });

  it('blocks when Google shares no email', async () => {
    const result = await service.handleGoogleUser(makeProfile({ email: null }));
    expect(result).toEqual({ blocked: 'no_email' });
    expect(query).not.toHaveBeenCalled();
  });
});
