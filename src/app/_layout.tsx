import { Slot } from 'expo-router';
import { useAuth } from '@core/hooks/useAuth';
import { ToastContainer } from '@components/ui/Toast';

export default function RootLayout() {
  useAuth();
  return (
    <>
      <Slot />
      <ToastContainer />
    </>
  );
}
