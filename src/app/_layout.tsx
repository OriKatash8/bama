import { Slot, SplashScreen } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@core/hooks/useAuth';
import { ToastContainer } from '@components/ui/Toast';
import { ThemeProvider, useTheme } from '@core/hooks/useTheme';

(Text as any).defaultProps = { ...(Text as any).defaultProps, style: [{ fontFamily: 'Heebo-Regular' }, (Text as any).defaultProps?.style] };
(TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, style: [{ fontFamily: 'Heebo-Regular' }, (TextInput as any).defaultProps?.style] };

SplashScreen.preventAutoHideAsync();

function AppShell() {
  useAuth();

  const [fontsLoaded] = useFonts({
    'Heebo-Thin':       require('../../assets/fonts/Heebo-Thin.ttf'),
    'Heebo-ExtraLight': require('../../assets/fonts/Heebo-ExtraLight.ttf'),
    'Heebo-Light':      require('../../assets/fonts/Heebo-Light.ttf'),
    'Heebo-Regular':    require('../../assets/fonts/Heebo-Regular.ttf'),
    'Heebo-Medium':     require('../../assets/fonts/Heebo-Medium.ttf'),
    'Heebo-SemiBold':   require('../../assets/fonts/Heebo-SemiBold.ttf'),
    'Heebo-Bold':       require('../../assets/fonts/Heebo-Bold.ttf'),
    'Heebo-ExtraBold':  require('../../assets/fonts/Heebo-ExtraBold.ttf'),
    'Heebo-Black':      require('../../assets/fonts/Heebo-Black.ttf'),
    PeaceSans:          require('../../assets/fonts/peace-sans.ttf'),
    Montserrat:         require('../../assets/fonts/Montserrat-VariableFont_wght.ttf'),
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
