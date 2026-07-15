import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { useAppFont } from '@core/hooks/useAppFont';
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

export function GoogleSignInButton() {
  const { signInWithGoogle, isLoading } = useGoogleSignIn();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  return (
    <View>
      {/* "or" divider */}
      <View style={[styles.divider, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <View style={styles.dividerLine} />
        <Text style={[styles.dividerText, { fontFamily: font.regular }]}>
          {t('auth.or')}
        </Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Google button */}
      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={signInWithGoogle}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#555" />
        ) : (
          <View style={[styles.btnRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Text style={styles.googleG}>G</Text>
            <Text style={[styles.btnLabel, { fontFamily: font.semiBold }]}>
              {t('auth.continue_google')}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  dividerText: { fontSize: 13, color: 'rgba(0,0,0,0.4)' },

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
  googleG: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
    width: 22,
    textAlign: 'center',
  },
  btnLabel: { fontSize: 15, color: '#333' },
});
