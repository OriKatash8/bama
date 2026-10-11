import { useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { subscribePhone } from '@features/auth/services/phoneService';

/**
 * Whether the signed-in user has a phone number on file: true, false, or null
 * while unknown (still loading, or the read failed).
 *
 * The number is optional — nothing gates on it (App Store guideline 5.1.1(v)).
 * This only keeps `hasPhone` in the store live, so the setup form knows whether
 * to offer the phone field.
 */
export function usePhoneOnFile(): boolean | null {
  const userId = useAuthStore((s) => s.user?.id);
  const hasPhone = useAuthStore((s) => s.hasPhone);
  const setHasPhone = useAuthStore((s) => s.setHasPhone);

  useEffect(() => {
    if (!userId) {
      setHasPhone(null);
      return;
    }
    return subscribePhone(
      userId,
      (phone) => setHasPhone(phone !== null),
      (err) => {
        console.warn('[phone] contact read failed:', err);
        setHasPhone(null);
      },
    );
  }, [userId, setHasPhone]);

  return userId ? hasPhone : null;
}
