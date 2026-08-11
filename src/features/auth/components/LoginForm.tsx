import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { Image } from 'expo-image';

const BAMA_LOGO = require('../../../../assets/images/bama-logo.png');
import { useRouter } from 'expo-router';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { useLogin } from '@features/auth/hooks/useLogin';
import { GoogleSignInButton } from './GoogleSignInButton';
import { AppleSignInButton } from './AppleSignInButton';
import { AuthSettingsButton } from './AuthSettingsButton';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { isValidEmail, isNonEmpty } from '@utils/validators';
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

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const { isLoading, login } = useLogin();
  const router = useRouter();
  const colors = useTheme();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const textAlign = rtl ? 'right' : 'left' as const;

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!isValidEmail(email)) errors.email = t('auth.err_valid_email');
    if (!isNonEmpty(password)) errors.password = t('auth.err_password_required');
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    await login(email, password);
  }

  return (
    <View style={styles.container}>
      <AuthSettingsButton />
      <Image source={BAMA_LOGO} style={styles.appLogo} contentFit="contain" cachePolicy="memory-disk" />
      <View style={[styles.card, { backgroundColor: '#ffffff', borderColor: colors.border }, Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as object)]}>
        <AppText weight="bold" style={styles.title}>{t('auth.sign_in')}</AppText>
        <Input
          placeholder={t('auth.email')}
          placeholderTextColor={colors.placeholder}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={fieldErrors.email}
          textAlign={textAlign}

          style={{ borderColor: '#cb6ce6', color: colors.text, ...font.regular, textAlign }}
        />
        <Input
          placeholder={t('auth.password')}
          placeholderTextColor={colors.placeholder}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={fieldErrors.password}
          textAlign={textAlign}

          style={{ borderColor: '#cb6ce6', color: colors.text, ...font.regular, textAlign }}
        />
        <TouchableOpacity style={{ alignSelf: rtl ? 'flex-start' : 'flex-end' }} onPress={() => router.push('/(auth)/forgot-password')}>
          <AppText weight="regular" style={[styles.link, { color: colors.text, textAlign }]}>
            {t('auth.forgot_password')}
          </AppText>
        </TouchableOpacity>
        <Button
          label={t('auth.login')}
          onPress={handleSubmit}
          disabled={isLoading}
          style={Platform.OS === 'web' ? ({
            background: 'linear-gradient(to right, #004aad, #cb6ce6)',
          } as object) : { backgroundColor: '#004aad' }}
        />
        <View style={[styles.footer, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <AppText weight="regular" style={[styles.footerText, { color: colors.text }]}>
            {t('auth.no_account')}
          </AppText>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <AppText weight="semiBold" style={[styles.link, { color: colors.text }]}>
              {t('auth.register_link')}
            </AppText>
          </TouchableOpacity>
        </View>

        <GoogleSignInButton />
        <AppleSignInButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 40 },
  card: {
    borderRadius: 20,
    padding: 24,
    gap: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  appLogo: { width: '80%', height: 130, resizeMode: 'contain', alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '900', color: '#004aad', marginBottom: 8, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '500', textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { fontSize: 14 },
});
