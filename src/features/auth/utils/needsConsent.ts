import { CURRENT_TERMS_VERSION, isTermsVersionCurrent } from '@core/constants/legal';
import type { User } from '@core/types/user';

/**
 * A signed-in user must (re-)accept when their stored termsVersion is missing
 * or older than CURRENT_TERMS_VERSION. No user loaded is not a "yes".
 * Pure, with no Firebase imports: every gate and layout calls it.
 */
export function needsConsent(
  user: Pick<User, 'termsVersion'> | null | undefined,
  current: string = CURRENT_TERMS_VERSION,
): boolean {
  if (!user) return false;
  return !isTermsVersionCurrent(user.termsVersion, current);
}
