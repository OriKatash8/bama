import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { deleteUser } from 'firebase/auth';
import { AppText } from '@components/ui/AppText';
import { Button } from '@components/ui/Button';
import { Checkbox } from '@components/ui/Checkbox';
import { auth } from '@core/firebase/config';
import { signOut } from '@core/firebase/auth';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useTheme } from '@core/hooks/useTheme';
import { legalUrl } from '@core/constants/legal';
import { usePendingSignupStore } from '@features/auth/stores/pendingSignupStore';
import { discardUnconsentedSignup, recordConsent } from '@features/auth/utils/consent';
import { syncUser } from '@features/auth/utils/syncUser';
import { postStepRoute } from '@features/auth/utils/postStepRoute';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BAMA_LOGO = require('../../../../assets/images/bama-logo.png');

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

/**
 * The consent screen. Two ways in, one screen:
 *   - a NEW account made with a social button (Apple, or Google when enabled),
 *     from login or register — nothing has been written for it yet;
 *   - an existing account whose termsVersion is missing or older than
 *     CURRENT_TERMS_VERSION (the re-accept gate).
 * Both boxes start unchecked. Only Continue, with both checked, writes
 * termsAcceptedAt, termsVersion, ageConfirmed and ageConfirmedAt. Cancel signs
 * out, and for a brand-new account removes it entirely (discardUnconsentedSignup).
 */
export function ConsentForm() {
  const router = useRouter();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const textAlign = rtl ? 'right' : 'left';
  const { showToast } = useUiStore();
  const setUser = useAuthStore((s) => s.setUser);
  const pending = usePendingSignupStore((s) => s.pending);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const canContinue = termsAccepted && ageConfirmed && busy === null;

  async function handleAccept() {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !termsAccepted || !ageConfirmed) return;
    setBusy('accept');
    try {
      const fields = await recordConsent(firebaseUser.uid);
      if (pending && pending.uid === firebaseUser.uid) {
        // The new account's profile, from what the provider told us at sign-in.
        // It then fills in its name / picture / phone before mode select.
        await syncUser(firebaseUser.uid, pending, setUser, undefined, { newAccount: true });
        usePendingSignupStore.getState().setPending(null);
      } else {
        const current = useAuthStore.getState().user;
        if (current) setUser({ ...current, ...fields });
      }
      // The next step directly — never '/', which from inside (auth) is login.
      router.replace((await postStepRoute(useAuthStore.getState())) as never);
    } catch (e) {
      console.warn('[consent] could not record consent:', e);
      showToast(t('auth.consent_failed'), 'error');
      setBusy(null);
    }
  }

  async function handleDecline() {
    const firebaseUser = auth.currentUser;
    setBusy('decline');
    try {
      if (firebaseUser) {
        try {
          // The server removes the account only if it is brand new and never
          // consented; for anyone else it does nothing and we just sign out.
          await discardUnconsentedSignup({});
        } catch (e) {
          // Server unreachable: a sign-up made moments ago can still be removed
          // from here (its Auth user; users/{uid} needs the server).
          console.warn('[consent] discardUnconsentedSignup failed:', e);
          if (pending && pending.uid === firebaseUser.uid) {
            await deleteUser(firebaseUser).catch((err) => console.warn('[consent] deleteUser failed:', err));
          }
        }
      }
    } finally {
      usePendingSignupStore.getState().setPending(null);
      await signOut().catch(() => undefined);
      router.replace('/(auth)');
    }
  }

  const termsLabel = (
    <AppText weight="regular" style={[styles.checkText, { color: colors.text, textAlign }]}>
      {t('auth.terms_agree_prefix')}
      <Text style={styles.link} onPress={() => void Linking.openURL(legalUrl('terms', language))} testID="consent-terms-link">
        {t('auth.terms_of_service')}
      </Text>
      {t('auth.terms_and')}
      <Text style={styles.link} onPress={() => void Linking.openURL(legalUrl('privacy', language))} testID="consent-privacy-link">
        {t('auth.privacy_policy')}
      </Text>
    </AppText>
  );

  return (
    <View style={styles.container} testID="consent-screen">
      <Image source={BAMA_LOGO} style={styles.logo} contentFit="contain" cachePolicy="memory-disk" />
      <View
        style={[
          styles.card,
          { borderColor: colors.border },
          Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as object),
        ]}
      >
        <AppText weight="bold" style={styles.title}>{t('auth.consent_title')}</AppText>
        <AppText weight="regular" style={[styles.body, { color: colors.text, textAlign }]}>
          {t('auth.consent_body')}
        </AppText>

        <Checkbox
          testID="consent-terms"
          checked={termsAccepted}
          onChange={setTermsAccepted}
          label={termsLabel}
          rtl={rtl}
        />
        <Checkbox
          testID="consent-age"
          checked={ageConfirmed}
          onChange={setAgeConfirmed}
          rtl={rtl}
          label={
            <AppText weight="regular" style={[styles.checkText, { color: colors.text, textAlign }]}>
              {t('auth.age_confirm')}
            </AppText>
          }
        />

        <View testID="consent-continue" accessibilityState={{ disabled: !canContinue }}>
          <Button
            label={busy === 'accept' ? '…' : t('auth.consent_continue')}
            onPress={handleAccept}
            disabled={!canContinue}
            style={Platform.OS === 'web' ? ({ background: 'linear-gradient(to right, #004aad, #cb6ce6)' } as object) : undefined}
            gradientColors={['#004aad', '#cb6ce6']}
          />
        </View>

        <TouchableOpacity
          onPress={handleDecline}
          disabled={busy !== null}
          style={styles.decline}
          accessibilityRole="button"
          testID="consent-decline"
        >
          {busy === 'decline'
            ? <ActivityIndicator size="small" color="#004aad" />
            : <AppText weight="semiBold" style={styles.declineText}>{t('auth.consent_decline')}</AppText>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 40 },
  logo: { width: '80%', height: 130, alignSelf: 'center', marginBottom: 20 },
  card: {
    borderRadius: 20,
    padding: 24,
    gap: 16,
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  title: { fontSize: 26, color: '#004aad', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21 },
  checkText: { fontSize: 13, lineHeight: 20 },
  link: { fontWeight: '600', textDecorationLine: 'underline', color: '#004aad' },
  decline: { alignItems: 'center', paddingVertical: 6, minHeight: 32, justifyContent: 'center' },
  declineText: { fontSize: 14, color: '#004aad' },
});
