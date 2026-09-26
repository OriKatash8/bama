import { useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { subscribePhone } from '@features/auth/services/phoneService';

/**
 * True when the signed-in user has no phone number and must enter one.
 *
 * The number is required, but not everyone saw the registration form: Google and
 * Apple sign-in skip it, and accounts from before it existed have none. Both group
 * layouts call this and redirect to /settings/phone?required=1 while it is true.
 *
 * Only a CONFIRMED absence gates. Unknown (still loading) or a failed read leave
 * `hasPhone` null, and null never locks anyone out of the app.
 */
export function usePhoneGate(): boolean {
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

  return !!userId && hasPhone === false;
}
