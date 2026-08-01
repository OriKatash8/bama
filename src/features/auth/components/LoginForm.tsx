import { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { useLogin } from '@features/auth/hooks/useLogin';
import { GoogleSignInButton } from './GoogleSignInButton';
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
      <Image source={require('../../../../assets/images/bama-logo.png')} style={styles.appLogo} resizeMode="contain" />
      <View style={[styles.card, { backgroundColor: '#ffffff', borderColor: colors.border }, Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as object)]}>
        <Text style={[styles.title, { fontFamily: font.bold }]}>{t('auth.sign_in')}</Text>
        <Input
          placeholder={t('auth.email')}
          placeholderTextColor={colors.placeholder}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={fieldErrors.email}
          textAlign={textAlign}

          style={{ borderColor: '#cb6ce6', color: colors.text, fontFamily: font.regular, textAlign }}
        />
        <Input
          placeholder={t('auth.password')}
          placeholderTextColor={colors.placeholder}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={fieldErrors.password}
          textAlign={textAlign}

          style={{ borderColor: '#cb6ce6', color: colors.text, fontFamily: font.regular, textAlign }}
        />
        <TouchableOpacity style={{ alignSelf: rtl ? 'flex-start' : 'flex-end' }} onPress={() => router.push('/(auth)/forgot-password')}>
          <Text style={[styles.link, { color: colors.text, fontFamily: font.regular, textAlign }]}>
            {t('auth.forgot_password')}
          </Text>
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
          <Text style={[styles.footerText, { color: colors.text, fontFamily: font.regular }]}>
            {t('auth.no_account')}
          </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={[styles.link, { color: colors.text, fontFamily: font.semiBold }]}>
              {t('auth.register_link')}
            </Text>
          </TouchableOpacity>
        </View>

        <GoogleSignInButton />
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
