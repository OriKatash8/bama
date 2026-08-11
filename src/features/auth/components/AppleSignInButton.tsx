import { ActivityIndicator, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { Apple } from 'lucide-react-native';
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
        <View style={[styles.btnRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <Apple size={20} color="#000000" />
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
    height: 48,
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
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btnLabel: { fontSize: 15, color: '#333' },
});
