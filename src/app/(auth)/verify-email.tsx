import { Screen } from '@components/layout/Screen';
import { VerifyEmailForm } from '@features/auth/components/VerifyEmailForm';

/** The email-verification gate (useOnboardingGate) for an unverified password account. */
export default function VerifyEmailScreen() {
  return (
    <Screen>
      <VerifyEmailForm />
    </Screen>
  );
}
