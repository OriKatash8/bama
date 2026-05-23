import { Slot } from 'expo-router';
import { useAuth } from '@core/hooks/useAuth';

export default function RootLayout() {
  useAuth();
  return <Slot />;
}
