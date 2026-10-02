import { Injectable } from '@nestjs/common';
import type { Profile } from 'passport-google-oauth20';
import { DbService } from '../db/db.service';

// Why the callback blocked a sign-in, surfaced to the frontend as a redirect
// query param (never an internal detail — just a stable, safe token).
export type GoogleBlockReason = 'email_not_verified' | 'no_email' | 'suspended';

export type GoogleAuthResult =
  { id: string; role: string } | { blocked: GoogleBlockReason };

function isBlocked(r: GoogleAuthResult): r is { blocked: GoogleBlockReason } {
  return 'blocked' in r;
}

@Injectable()
export class GoogleAuthService {
  constructor(private db: DbService) {}

  // Finds or creates the local user for a verified Google identity.
  //
  // Rules (Phase 9):
  //  1. An account already carrying this google_id signs straight in.
  //  2. Otherwise, if a local account with the same email exists, link it — but
  //     ONLY when Google reports the email as verified. This prevents someone from
  //     hijacking an existing account via an unverified Google email.
  //  3. Otherwise create a new Google-only user (role USER, no password).
  //  Suspended accounts are always refused.
  async handleGoogleUser(profile: Profile): Promise<GoogleAuthResult> {
    const googleId = profile.id;
    const rawEmail = profile.emails?.[0]?.value ?? profile._json?.email;
    if (!rawEmail) return { blocked: 'no_email' };
    const email = rawEmail.toLowerCase();

    const emailVerified = this.isEmailVerified(profile);
    const name = profile.displayName?.trim() || email;
    const avatar = profile.photos?.[0]?.value ?? profile._json?.picture ?? null;

    // 1. Existing Google-linked account.
    const byGoogle = await this.db.query(
      'SELECT id, role, account_status FROM users WHERE google_id = $1',
      [googleId],
    );
    const googleUser = byGoogle.rows[0];
    if (googleUser) return this.finalize(googleUser);

    // 2. Existing local account with the same email — link only if verified.
    const byEmail = await this.db.query(
      'SELECT id, role, account_status, google_id FROM users WHERE email = $1',
      [email],
    );
    const localUser = byEmail.rows[0];
    if (localUser) {
      if (!emailVerified) return { blocked: 'email_not_verified' };
      // Never create a duplicate: attach google_id to the existing row.
      await this.db.query(
        'UPDATE users SET google_id = $1, avatar_url = COALESCE($2, avatar_url) WHERE id = $3',
        [googleId, avatar, localUser.id],
      );
      return this.finalize(localUser);
    }

    // 3. Brand-new Google-only user. Require a verified email so we never create
    //    an account behind an address the person does not control.
    if (!emailVerified) return { blocked: 'email_not_verified' };
    const inserted = await this.db.query(
      'INSERT INTO users (name, email, password_hash, role, google_id, avatar_url, auth_provider) ' +
        "VALUES ($1, $2, NULL, 'USER', $3, $4, 'google') RETURNING id, role, account_status",
      [name, email, googleId, avatar],
    );
    return this.finalize(inserted.rows[0]);
  }

  private isEmailVerified(profile: Profile): boolean {
    // Google's userinfo normally returns a boolean, but some responses carry the
    // string "true"; treat both as verified. Typed as unknown so both comparisons
    // are intentional.
    const fromJson: unknown = profile._json?.email_verified;
    if (fromJson === true || fromJson === 'true') return true;
    return profile.emails?.[0]?.verified === true;
  }

  // Records the login time and refuses suspended accounts, returning the id/role
  // the controller uses to issue a normal app session.
  private async finalize(user: {
    id: string;
    role?: string | null;
    account_status?: string | null;
  }): Promise<GoogleAuthResult> {
    if (user.account_status === 'SUSPENDED') return { blocked: 'suspended' };
    await this.db.query(
      'UPDATE users SET last_login_at = now() WHERE id = $1',
      [user.id],
    );
    return { id: user.id, role: user.role ?? 'USER' };
  }
}

export { isBlocked };
