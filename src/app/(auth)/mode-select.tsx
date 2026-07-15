import { Screen } from '@components/layout/Screen';
import { ModePicker } from '@features/auth/components/ModePicker';

export default function ModeSelectScreen() {
  return (
    <Screen scrollable={false}>
      <ModePicker />
    </Screen>
  );
}
