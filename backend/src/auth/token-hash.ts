import { createHash } from 'crypto';

// Single definition of how opaque secret tokens (refresh tokens, admin invite
// tokens) are stored: only the SHA-256 hash is persisted, never the raw value.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
