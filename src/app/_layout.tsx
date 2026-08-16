import { I18nManager } from 'react-native';
I18nManager.forceRTL(false);
I18nManager.allowRTL(false);

import '../core/i18n';
import i18n from '../core/i18n';
import React from 'react';
import { Slot, SplashScreen } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@core/hooks/useAuth';
import { ToastContainer } from '@components/ui/Toast';
import { ReviewFlowGate } from '@features/reviews/components/ReviewFlowGate';
import { ThemeProvider, useTheme } from '@core/hooks/useTheme';
import { LanguageSync } from '@components/layout/LanguageSync';
import { I18nextProvider } from 'react-i18next';
import { useAppFont } from '@core/hooks/useAppFont';
import { setAudioModeAsync } from 'expo-audio';

SplashScreen.preventAutoHideAsync();

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <View style={{ flex: 1, padding: 20, paddingTop: 60, backgroundColor: 'white' }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: 'red', marginBottom: 10 }}>App Crash:</Text>
          <ScrollView>
            <Text style={{ fontSize: 12, color: 'black' }}>{err.toString()}</Text>
            <Text style={{ fontSize: 12, color: 'black', marginTop: 10 }}>{err.stack}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

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
    Montserrat: require('../../assets/fonts/Montserrat-VariableFont_wght.ttf'),
  });

  const [langKey, setLangKey] = useState(i18n.language);
  const colors = useTheme();
  const font = useAppFont();

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch((e) => {
      console.warn('[AudioMode] startup init failed:', e);
    });
  }, []);

  useEffect(() => {
    (Text as unknown as Record<string, unknown>).defaultProps = {
      ...((Text as unknown as Record<string, unknown>).defaultProps as object | undefined),
      style: [{ ...font.regular }],
    };
    (TextInput as unknown as Record<string, unknown>).defaultProps = {
      ...((TextInput as unknown as Record<string, unknown>).defaultProps as object | undefined),
      style: [{ ...font.regular }],
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
        <ReviewFlowGate />
      </LinearGradient>
    </I18nextProvider>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
