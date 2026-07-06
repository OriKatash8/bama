import { Slot, SplashScreen } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@core/hooks/useAuth';
import { ToastContainer } from '@components/ui/Toast';
import { ThemeProvider, useTheme } from '@core/hooks/useTheme';

(Text as any).defaultProps = { ...(Text as any).defaultProps, style: [{ fontFamily: 'Montserrat' }, (Text as any).defaultProps?.style] };
(TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, style: [{ fontFamily: 'Montserrat' }, (TextInput as any).defaultProps?.style] };

SplashScreen.preventAutoHideAsync();

function AppShell() {
  useAuth();

  const [fontsLoaded] = useFonts({
    PeaceSans: require('../../assets/fonts/peace-sans.ttf'),
    Montserrat: require('../../assets/fonts/Montserrat-VariableFont_wght.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  const colors = useTheme();

  if (!fontsLoaded) return null;

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.root}>
      <Slot />
      <ToastContainer />
    </LinearGradient>
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
