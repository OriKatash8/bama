import { Screen } from '@components/layout/Screen';
import { RegisterForm } from '@features/auth/components/RegisterForm';

export default function RegisterScreen() {
  return (
    <Screen backgroundColor="#0f0f1f">
      <RegisterForm />
    </Screen>
  );
}
