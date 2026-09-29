import type { User } from '@core/types/user';

/**
 * A brand-new account fills in its name, picture (and phone, if missing) on
 * /(auth)/setup before choosing client or professional. Only accounts created
 * with the flag set go there; existing accounts never carry it.
 * Pure, like needsConsent: the root, the gate and mode-select all call it.
 */
export function needsProfileSetup(user: Pick<User, 'needsProfileSetup'> | null | undefined): boolean {
  return user?.needsProfileSetup === true;
}
