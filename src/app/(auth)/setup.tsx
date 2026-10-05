import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import { usePhoneGate } from '@features/auth/hooks/usePhoneGate';
import { needsProfileSetup } from '@features/auth/utils/needsProfileSetup';
import { postStepRoute } from '@features/auth/utils/postStepRoute';
import { ProfileSetupForm } from '@features/auth/components/ProfileSetupForm';

/**
 * FIRST-TIME SETUP. A brand-new account comes here right after verifying its
 * email (or after consent, for Apple): name, picture and — if it has none —
 * phone. Then it chooses client or professional. Order: consent → email →
 * setup → mode select (index.tsx, useOnboardingGate, mode-select).
 */
export default function ProfileSetupScreen() {
  const router = useRouter();
  // Outside the group layouts, so load the phone answer here: the form asks
  // for a number only once it is known to be missing.
  usePhoneGate();
  // Checked once, on arrival: finishing clears the flag and navigates itself.
  const [alreadyDone] = useState(() => !needsProfileSetup(useAuthStore.getState().user));
  // Once: a second effect run would find a saved invite link already spent.
  const navigated = useRef(false);
  useEffect(() => {
    if (!alreadyDone || navigated.current) return;
    navigated.current = true;
    // The next step directly — never '/', which from inside (auth) is login.
    void postStepRoute(useAuthStore.getState()).then((to) => router.replace(to as never));
  }, [alreadyDone, router]);
  if (alreadyDone) return null;
  return (
    <ProfileSetupForm
      extraFields={{ needsProfileSetup: false }}
      subtitleKey="client_onboarding.setup_subtitle"
      onDone={() => router.replace('/(auth)/mode-select')}
    />
  );
}
