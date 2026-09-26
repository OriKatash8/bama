import { useAuthStore } from '@core/stores/authStore';
import { usePhoneGate } from '@features/auth/hooks/usePhoneGate';

/**
 * THE gate: where a signed-in user must go before the app, or null. One
 * mechanism, in rungs; the first rung that fails wins.
 *
 *   1. email — an unverified PASSWORD account (needsEmailVerification, which
 *      follows the ID token; Google/Apple are exempt) → /(auth)/verify-email
 *   2. phone — no number on file (usePhoneGate) → /settings/phone?required=1
 *   Further rungs (phone verification, forced pro-profile completion) go here,
 *   in order. The client onboarding and the pro profile lock still live in their
 *   group layouts, after this.
 *
 * Unknown never blocks: a rung only fires on a confirmed "not yet".
 * Both group layouts call this — and nothing else calls the rungs directly.
 */
export function useOnboardingGate(): string | null {
  const needsEmail = useAuthStore((s) => s.needsEmailVerification) === true;
  // Called unconditionally: it is a hook, and it keeps the phone read live.
  const needsPhone = usePhoneGate();
  if (needsEmail) return '/(auth)/verify-email';
  if (needsPhone) return '/settings/phone?required=1';
  return null;
}
