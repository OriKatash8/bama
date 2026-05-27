import { Screen } from '@components/layout/Screen';
import { RolePicker } from '@features/auth/components/RolePicker';

export default function RoleSelectScreen() {
  return (
    <Screen scrollable={false}>
      <RolePicker />
    </Screen>
  );
}
