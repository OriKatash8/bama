import { Screen } from '@components/layout/Screen';
import { LoginForm } from '@features/auth/components/LoginForm';

export default function LoginScreen() {
  return (
    <Screen backgroundColor="#0f0f1f">
      <LoginForm />
    </Screen>
  );
}
