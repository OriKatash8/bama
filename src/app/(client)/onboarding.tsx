import { useRouter } from 'expo-router';
import { ProfileSetupForm } from '@features/auth/components/ProfileSetupForm';

/** An account from before first-time setup, entering client mode the first time. */
export default function ClientOnboardingScreen() {
  const router = useRouter();
  return <ProfileSetupForm onDone={() => router.replace('/(client)/(tabs)/home')} />;
}
