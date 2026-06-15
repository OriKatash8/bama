import { Slot, SplashScreen } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { useAuth } from '@core/hooks/useAuth';
import { ToastContainer } from '@components/ui/Toast';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useAuth();

  const [fontsLoaded] = useFonts({
    PeaceSans: require('../../assets/fonts/peace-sans.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <>
      <Slot />
      <ToastContainer />
    </>
  );
}
