import type { User } from '@core/types/user';
import { needsConsent } from './needsConsent';
import { needsProfileSetup } from './needsProfileSetup';

type AuthState = {
  user: User | null;
  needsEmailVerification: boolean | null;
  activeMode: 'client' | 'professional' | null;
};

/**
 * Where a user goes next, in the gate order: consent → email verification →
 * first-time setup → mode select → the app. The root (`/`) redirects here, and
 * the (auth) screens navigate here DIRECTLY when their step is done.
 *
 * They must not replace('/') instead: groups are not part of a URL, so the
 * login screen, (auth)/index, is also "/" — and from inside the (auth) stack
 * "/" resolves to it. That is how a just-verified user landed on login.
 */
export function nextAuthRoute({ user, needsEmailVerification, activeMode }: AuthState): string {
  if (!user) return '/(auth)';
  if (needsConsent(user)) return '/(auth)/consent';
  if (needsEmailVerification === true) return '/(auth)/verify-email';
  if (needsProfileSetup(user)) return '/(auth)/setup';
  if (activeMode === null) return '/(auth)/mode-select';
  if (activeMode === 'client') return '/(client)/(tabs)/browse';
  return '/(professional)/(tabs)/dashboard';
}
