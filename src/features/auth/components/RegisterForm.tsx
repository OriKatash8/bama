import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { Image } from 'expo-image';

const BAMA_LOGO = require('../../../../assets/images/bama-logo.png');
import { useRouter } from 'expo-router';
import { CheckCircle, Circle } from 'lucide-react-native';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { useRegister } from '@features/auth/hooks/useRegister';
import { validatePassword } from '@features/auth/utils/validatePassword';
import { GoogleSignInButton } from './GoogleSignInButton';
import { AppleSignInButton } from './AppleSignInButton';
import { AuthSettingsButton } from './AuthSettingsButton';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
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

export function RegisterForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string }>({});
  const [passwordFocused, setPasswordFocused] = useState(false);

  const { isLoading, register } = useRegister();
  const router = useRouter();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();
  const textAlign = rtl ? 'right' : 'left' as const;

  const pwValidation = validatePassword(password);
  const pwValid = pwValidation.valid;

  function validate(): boolean {
    const errors: { fullName?: string; email?: string } = {};
    if (!isNonEmpty(fullName)) errors.fullName = t('auth.err_full_name_required');
    if (!isValidEmail(email)) errors.email = t('auth.err_valid_email');
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || !pwValid) return;
    await register(fullName, email, password);
  }

  return (
    <View style={styles.container}>
      <Image source={BAMA_LOGO} style={styles.appLogo} contentFit="contain" cachePolicy="memory-disk" />
      <View style={[styles.card, { backgroundColor: '#ffffff', borderColor: colors.border }, Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as object)]}>
        <AuthSettingsButton />
        <AppText weight="bold" style={styles.title}>{t('auth.register_title')}</AppText>
        <Input
          placeholder={t('auth.full_name')}
          placeholderTextColor={colors.placeholder}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          error={fieldErrors.fullName}
          textAlign={textAlign}

          style={{ borderColor: '#cb6ce6', color: colors.text, ...font.regular, textAlign }}
        />
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
          textAlign={textAlign}

          style={{ borderColor: '#cb6ce6', color: colors.text, ...font.regular, textAlign }}
          onFocus={() => setPasswordFocused(true)}
          onBlur={() => setPasswordFocused(false)}
        />

        {/* Live password checklist — only visible while password field is focused */}
        {passwordFocused && (
          <View style={styles.checklist}>
            {pwValidation.rules.map((rule) => (
              <View key={rule.key} style={[styles.checkRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                {rule.met
                  ? <CheckCircle size={14} color="#43a047" />
                  : <Circle size={14} color="rgba(0,0,0,0.3)" />}
                <AppText weight="regular" style={[
                  styles.checkLabel,
                  {
                    color: rule.met ? '#43a047' : 'rgba(0,0,0,0.45)',
                    marginLeft: rtl ? 0 : 6,
                    marginRight: rtl ? 6 : 0,
                    textAlign,
                  },
                ]}>
                  {t(rule.key)}
                </AppText>
              </View>
            ))}
          </View>
        )}

        <Button
          label={t('auth.create_account')}
          onPress={handleSubmit}
          disabled={isLoading || !pwValid}
          style={Platform.OS === 'web' ? ({
            background: 'linear-gradient(to right, #004aad, #cb6ce6)',
          } as object) : undefined}
          gradientColors={['#004aad', '#cb6ce6']}
        />
        <View style={[styles.footer, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <AppText weight="regular" style={[styles.footerText, { color: colors.text }]}>
            {t('auth.have_account')}
          </AppText>
          <TouchableOpacity onPress={() => router.push('/(auth)')}>
            <AppText weight="semiBold" style={[styles.link, { color: colors.text }]}>
              {t('auth.sign_in_link')}
            </AppText>
          </TouchableOpacity>
        </View>

        {/* "or" divider */}
        <View style={[styles.orDivider, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <View style={styles.dividerLine} />
          <AppText weight="regular" style={styles.dividerText}>{t('auth.or')}</AppText>
          <View style={styles.dividerLine} />
        </View>

        {/* Social buttons row */}
        <View style={[styles.socialRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <GoogleSignInButton style={{ flex: 1 }} showDivider={false} />
          <AppleSignInButton style={{ flex: 1 }} />
        </View>
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
    shadowColor: '#7b4fd4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 12,
  },
  appLogo: { width: '80%', height: 130, resizeMode: 'contain', alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '900', color: '#004aad', marginBottom: 8, textAlign: 'center' },
  checklist: { gap: 6, paddingHorizontal: 2 },
  checkRow: { flexDirection: 'row', alignItems: 'center' },
  checkLabel: { fontSize: 13 },
  link: { fontSize: 14, fontWeight: '500', textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { fontSize: 14 },
  orDivider: { alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  dividerText: { fontSize: 13, color: 'rgba(0,0,0,0.4)' },
  socialRow: { gap: 8 },
});
