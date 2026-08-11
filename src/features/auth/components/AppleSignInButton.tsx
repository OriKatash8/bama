import { ActivityIndicator, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { SvgXml } from 'react-native-svg';

const APPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 814 1000" width="814" height="1000"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>`;
import { useAppleSignIn } from '../hooks/useAppleSignIn';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

// Inner component holds all hooks — rendered only on iOS, so no conditional hook calls.
function AppleButton() {
  const { signInWithApple, isLoading } = useAppleSignIn();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  return (
    <TouchableOpacity
      style={[styles.button, isLoading && styles.buttonDisabled]}
      onPress={signInWithApple}
      disabled={isLoading}
      activeOpacity={0.8}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#555" />
      ) : (
        <View style={styles.btnRow}>
          <View style={rtl ? styles.logoRight : styles.logoLeft}>
            <SvgXml xml={APPLE_SVG} width={20} height={24} />
          </View>
          <AppText weight="semiBold" style={styles.btnLabel}>
            {t('auth.continue_apple')}
          </AppText>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function AppleSignInButton() {
  if (Platform.OS !== 'ios') return null;
  return <AppleButton />;
}

const styles = StyleSheet.create({
  button: {
    height: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  buttonDisabled: { opacity: 0.6 },
  btnRow: { width: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  logoLeft: { position: 'absolute', left: 12 },
  logoRight: { position: 'absolute', right: 16 },
  btnLabel: { fontSize: 15, color: '#333', textAlign: 'center' },
});
