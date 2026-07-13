import '../core/i18n';
import i18n from '../core/i18n';
import { Slot, SplashScreen } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@core/hooks/useAuth';
import { ToastContainer } from '@components/ui/Toast';
import { ThemeProvider, useTheme } from '@core/hooks/useTheme';
import { LanguageSync } from '@components/layout/LanguageSync';
import { I18nextProvider } from 'react-i18next';
import { useAppFont } from '@core/hooks/useAppFont';

SplashScreen.preventAutoHideAsync();

function AppShell() {
  const storedSettings = localStorage.getItem('bama-settings');
  if (storedSettings) {
    try {
      const { state } = JSON.parse(storedSettings) as { state?: { language?: string } };
      if (state?.language && state.language !== i18n.language) {
        i18n.changeLanguage(state.language);
      }
    } catch {}
  }

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
    'Montserrat-Regular':  require('../../assets/fonts/Montserrat-VariableFont_wght.ttf'),
    'Montserrat-Medium':   require('../../assets/fonts/Montserrat-VariableFont_wght.ttf'),
    'Montserrat-SemiBold': require('../../assets/fonts/Montserrat-VariableFont_wght.ttf'),
    'Montserrat-Bold':     require('../../assets/fonts/Montserrat-VariableFont_wght.ttf'),
    'Montserrat-Light':    require('../../assets/fonts/Montserrat-VariableFont_wght.ttf'),
    Montserrat:            require('../../assets/fonts/Montserrat-VariableFont_wght.ttf'),
  });

  const [langKey, setLangKey] = useState(i18n.language);
  const colors = useTheme();
  const font = useAppFont();

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    (Text as unknown as Record<string, unknown>).defaultProps = {
      ...((Text as unknown as Record<string, unknown>).defaultProps as object | undefined),
      style: [{ fontFamily: font.regular }],
    };
    (TextInput as unknown as Record<string, unknown>).defaultProps = {
      ...((TextInput as unknown as Record<string, unknown>).defaultProps as object | undefined),
      style: [{ fontFamily: font.regular }],
    };
  }, [font.regular]);

  useEffect(() => {
    const handler = (lang: string) => setLangKey(lang);
    i18n.on('languageChanged', handler);
    return () => { i18n.off('languageChanged', handler); };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <I18nextProvider i18n={i18n}>
      <LinearGradient key={langKey} colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.root}>
        <LanguageSync />
        <Slot />
        <ToastContainer />
      </LinearGradient>
    </I18nextProvider>
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
