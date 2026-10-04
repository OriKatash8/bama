import type { User } from '@core/types/user';
import { needsConsent } from './needsConsent';
import { needsProfileSetup } from './needsProfileSetup';

type AuthState = {
  user: User | null;
  needsEmailVerification: boolean | null;
  activeMode: 'client' | 'professional' | null;
  /** false = an incomplete pro, locked to the profile screen; null/absent = unknown
   *  (the pro layout's lock still applies once its own subscription answers). */
  proProfileCompleted?: boolean | null;
};

/**
 * Where a user goes next, in the gate order: consent → email verification →
 * first-time setup → mode select → the app. `activeMode` is the restored last
 * mode (useAuth), so this gives that mode's home — client home, or the pro
 * noticeboard (the profile screen while it is incomplete). The root (`/`) only
 * uses that after the first launch visit, which opens mode-select (app/index.tsx).
 * The root (`/`) redirects here, and
 * the (auth) screens navigate here DIRECTLY when their step is done.
 *
 * They must not replace('/') instead: groups are not part of a URL, so the
 * login screen, (auth)/index, is also "/" — and from inside the (auth) stack
 * "/" resolves to it. That is how a just-verified user landed on login.
 */
export function nextAuthRoute({ user, needsEmailVerification, activeMode, proProfileCompleted }: AuthState): string {
  if (!user) return '/(auth)';
  if (needsConsent(user)) return '/(auth)/consent';
  if (needsEmailVerification === true) return '/(auth)/verify-email';
  if (needsProfileSetup(user)) return '/(auth)/setup';
  if (activeMode === null) return '/(auth)/mode-select';
  if (activeMode === 'client') return '/(client)/(tabs)/home';
  if (proProfileCompleted === false) return '/(professional)/(tabs)/profile';
  return '/(professional)/(tabs)/dashboard';
}
