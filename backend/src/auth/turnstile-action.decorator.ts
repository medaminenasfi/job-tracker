import { SetMetadata } from '@nestjs/common';

export const TURNSTILE_ACTION_KEY = 'turnstile_action';

// Tags a route with the Turnstile `action` the widget was rendered with, so
// TurnstileGuard can reject a token minted for a different form (e.g. a
// `register` token replayed against `login`). Enforced by TurnstileGuard.
export const TurnstileAction = (action: string) =>
  SetMetadata(TURNSTILE_ACTION_KEY, action);
