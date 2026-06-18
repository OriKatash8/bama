import { Slot, SplashScreen } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '@core/hooks/useAuth';
import { ToastContainer } from '@components/ui/Toast';
import { ThemeProvider, useTheme } from '@core/hooks/useTheme';

SplashScreen.preventAutoHideAsync();

function AppShell() {
  useAuth();

  const [fontsLoaded] = useFonts({
    PeaceSans: require('../../assets/fonts/peace-sans.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  const colors = useTheme();

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Slot />
      <ToastContainer />
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
