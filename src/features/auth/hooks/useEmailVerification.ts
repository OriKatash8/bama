import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { auth } from '@core/firebase/config';
import { sendVerificationEmail } from '@core/firebase/auth';

export type VerificationState = 'idle' | 'sending' | 'sent' | 'checking' | 'verified' | 'error';

const COOLDOWN_SECONDS = 60;
const POLL_MS = 5000;

/**
 * The verify-email screen's logic.
 *
 * - `resend()` sends the link again, then holds off for 60s. Failures become an
 *   i18n key (`errorKey`) — a rate limit gets its own friendly message, anything
 *   else the generic one; the raw Firebase code is never surfaced.
 * - `checkVerified()` reloads the user and then REFRESHES THE TOKEN. The reload
 *   updates `emailVerified` on the client; the refresh is what puts
 *   `email_verified` into the token the rules read, and it fires onIdTokenChanged,
 *   which is what lifts the gate (useAuth → needsEmailVerification).
 * - While the screen is focused it checks quietly every 5s, and stops once
 *   verified, on blur, or on unmount. A quiet check never shows "not yet".
 */
export function useEmailVerification({ poll = true }: { poll?: boolean } = {}) {
  const [state, setState] = useState<VerificationState>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const verifiedRef = useRef(false);
  const checkingRef = useRef(false);

  // One interval per cooldown, ticking down to 0 and then stopping itself.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startCooldown = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    setCooldown(COOLDOWN_SECONDS);
    tickRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
        return Math.max(0, c - 1);
      });
    }, 1000);
  }, []);
  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  const resend = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || cooldown > 0) return;
    setState('sending');
    setErrorKey(null);
    try {
      await sendVerificationEmail(user);
      setState('sent');
      startCooldown();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setState('error');
      setErrorKey(code === 'auth/too-many-requests' ? 'email_verification.err_too_many' : 'email_verification.err_generic');
    }
  }, [cooldown, startCooldown]);

  const check = useCallback(async (quiet: boolean): Promise<boolean> => {
    const user = auth.currentUser;
    if (!user || checkingRef.current) return verifiedRef.current;
    checkingRef.current = true;
    if (!quiet) { setState('checking'); setErrorKey(null); }
    try {
      await user.reload();
      await user.getIdToken(true);
      const verified = auth.currentUser?.emailVerified ?? user.emailVerified;
      if (verified) {
        verifiedRef.current = true;
        setState('verified');
      } else if (!quiet) {
        setState('idle');
        setErrorKey('email_verification.not_yet');
      }
      return verified;
    } catch {
      if (!quiet) { setState('error'); setErrorKey('email_verification.err_generic'); }
      return false;
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const checkVerified = useCallback(() => check(false), [check]);

  useFocusEffect(
    useCallback(() => {
      if (!poll) return;
      const timer = setInterval(() => {
        if (verifiedRef.current) { clearInterval(timer); return; }
        void check(true);
      }, POLL_MS);
      return () => clearInterval(timer);
    }, [poll, check]),
  );

  return { state, errorKey, cooldown, resend, checkVerified };
}
