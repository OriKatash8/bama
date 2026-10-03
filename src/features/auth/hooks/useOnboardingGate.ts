import { useAuthStore } from '@core/stores/authStore';
import { usePhoneGate } from '@features/auth/hooks/usePhoneGate';
import { needsConsent } from '@features/auth/utils/needsConsent';
import { needsProfileSetup } from '@features/auth/utils/needsProfileSetup';

/**
 * THE gate: where a signed-in user must go before the app, or null. One
 * mechanism, in rungs; the first rung that fails wins.
 *
 *  -1. signed out — loading finished and nobody is signed in → /(auth), the
 *      login screen. A device whose account was deleted elsewhere is signed out
 *      by Firebase (or by useAuth's accountGone check) while a screen is open;
 *      without this rung it stayed on that screen, nameless.
 *   0. consent — termsVersion missing or older than CURRENT_TERMS_VERSION
 *      (needsConsent) → /(auth)/consent. First: nothing else is shown to
 *      someone who has not accepted the current Terms and confirmed 18+.
 *   1. email — an unverified PASSWORD account (needsEmailVerification, which
 *      follows the ID token; Google/Apple are exempt) → /(auth)/verify-email
 *   2. setup — a brand-new account's name / picture / phone page
 *      (needsProfileSetup) → /(auth)/setup. It asks for the phone itself.
 *   3. phone — no number on file (usePhoneGate) → /settings/phone?required=1
 *   Further rungs (phone verification, forced pro-profile completion) go here,
 *   in order. The client onboarding and the pro profile lock still live in their
 *   group layouts, after this.
 *
 * A rung only redirects on a confirmed "not yet". An UNKNOWN email answer is not
 * treated as a pass, though: the root and the layouts show GatePendingScreen
 * until it arrives (useGatePending), so the app never renders for someone who
 * might still need to verify.
 * Both group layouts call this — and nothing else calls the rungs directly.
 */
export function useOnboardingGate(opts?: { deferPhone?: boolean }): string | null {
  const signedOut = useAuthStore((s) => !s.isLoading && s.user === null);
  const mustConsent = useAuthStore((s) => needsConsent(s.user));
  const needsEmail = useAuthStore((s) => s.needsEmailVerification) === true;
  const mustSetUp = useAuthStore((s) => needsProfileSetup(s.user));
  // Called unconditionally: it is a hook, and it keeps the phone read live.
  const needsPhone = usePhoneGate();
  if (signedOut) return '/(auth)';
  if (mustConsent) return '/(auth)/consent';
  if (needsEmail) return '/(auth)/verify-email';
  if (mustSetUp) return '/(auth)/setup';
  // deferPhone: a later step asks for the number itself (the client
  // onboarding page), so this rung waits until that step is done.
  if (needsPhone && !opts?.deferPhone) return '/settings/phone?required=1';
  return null;
}
