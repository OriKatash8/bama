import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { auth } from '@core/firebase/config';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useEmailVerification } from '@features/auth/hooks/useEmailVerification';
import { useLogout } from '@features/auth/hooks/useLogout';
import { AuthSettingsButton } from './AuthSettingsButton';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

const BAMA_LOGO = require('../../../../assets/images/bama-logo.png');

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{{${k}}}`, v);
    return str;
  };
}

const BRAND = '#004aad';

/**
 * The email-verification gate's screen, for a password account that has not
 * verified (useOnboardingGate sends them here). Same card as registration.
 *
 * Once verified — by "check again" or the quiet 5s poll — it goes to `/`, which
 * routes on (mode-select for a new account). The token refresh inside the check
 * has already lifted the gate by then (useAuth → needsEmailVerification), so `/`
 * does not bounce back here.
 *
 * Errors and confirmations are inline text: Alert.alert does nothing on web.
 */
export function VerifyEmailForm() {
  const router = useRouter();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const textAlign = rtl ? 'right' : 'left';
  const { state, errorKey, cooldown, resend, checkVerified } = useEmailVerification();
  const { logout } = useLogout();
  const email = auth.currentUser?.email ?? '';

  useEffect(() => {
    if (state === 'verified') router.replace('/');
  }, [state, router]);

  async function handleCheck() {
    if (await checkVerified()) router.replace('/');
  }

  return (
    <View style={styles.container}>
      <Image source={BAMA_LOGO} style={styles.appLogo} contentFit="contain" cachePolicy="memory-disk" />
      <View style={[styles.card, Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as object)]}>
        <AuthSettingsButton />
        <MailCheck size={40} color={BRAND} strokeWidth={1.6} style={styles.icon} />
        <AppText weight="bold" style={styles.title}>{t('email_verification.title')}</AppText>

        <AppText weight="regular" style={[styles.body, { textAlign }]}>{t('email_verification.sent_to')}</AppText>
        {/* An address is Latin text: left-to-right inside the Hebrew layout, or
            the "@" and the dots land in the wrong places. */}
        <AppText weight="semiBold" style={styles.email} numberOfLines={1}>{email}</AppText>
        <AppText weight="regular" style={[styles.body, { textAlign }]}>{t('email_verification.explain')}</AppText>

        {errorKey ? (
          <AppText weight="regular" style={[styles.error, { textAlign }]}>{t(errorKey)}</AppText>
        ) : state === 'sent' ? (
          <AppText weight="regular" style={[styles.ok, { textAlign }]}>{t('email_verification.sent_ok')}</AppText>
        ) : null}

        <TouchableOpacity
          style={[styles.primary, state === 'checking' && styles.busy]}
          onPress={handleCheck}
          disabled={state === 'checking'}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          {state === 'checking'
            ? <ActivityIndicator color="#ffffff" />
            : <AppText weight="bold" style={styles.primaryText}>{t('email_verification.check_again')}</AppText>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondary, (cooldown > 0 || state === 'sending') && styles.busy]}
          onPress={() => void resend()}
          disabled={cooldown > 0 || state === 'sending'}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <AppText weight="semiBold" style={styles.secondaryText}>
            {cooldown > 0
              ? t('email_verification.resend_in', { s: String(cooldown) })
              : t('email_verification.resend')}
          </AppText>
        </TouchableOpacity>

        <View style={styles.links}>
          <TouchableOpacity onPress={() => void logout('/(auth)/register')} accessibilityRole="button" hitSlop={8}>
            <AppText weight="medium" style={styles.link}>{t('email_verification.change_email')}</AppText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void logout()} accessibilityRole="button" hitSlop={8}>
            <AppText weight="medium" style={styles.link}>{t('email_verification.logout')}</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  appLogo: { width: '70%', height: 110, alignSelf: 'center', marginBottom: 16 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: '#EAE8F0',
    shadowColor: '#7b4fd4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  icon: { alignSelf: 'center' },
  title: { fontSize: 24, color: BRAND, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21, color: '#1a1626' },
  email: { fontSize: 16, color: '#000000', textAlign: 'center', writingDirection: 'ltr' },
  error: { fontSize: 13, lineHeight: 19, color: '#c0392b' },
  ok: { fontSize: 13, lineHeight: 19, color: '#1e7a46' },
  primary: { height: 48, borderRadius: 12, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { color: '#ffffff', fontSize: 16 },
  secondary: { height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: BRAND, fontSize: 15 },
  busy: { opacity: 0.55 },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  link: { fontSize: 13.5, color: BRAND, textDecorationLine: 'underline' },
});
