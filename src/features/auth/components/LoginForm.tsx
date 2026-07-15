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

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const { isLoading, login } = useLogin();
  const router = useRouter();
  const colors = useTheme();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const appNameSize = 130;

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!isValidEmail(email)) errors.email = 'Enter a valid email.';
    if (!isNonEmpty(password)) errors.password = 'Password is required.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    await login(email, password);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.titleWrap, { marginBottom: -60 }]}>
        <Image source={require('../../../../assets/images/bama-logo.png')} style={styles.appLogo} resizeMode="contain" />
      </View>
      <View style={[styles.card, { backgroundColor: '#ffffff', borderColor: colors.border }, Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as any)]}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>SIGN IN</Text>
        </View>
        <Input
          placeholder="Email"
          placeholderTextColor={colors.placeholder}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={fieldErrors.email}
          style={{ borderColor: '#cb6ce6', color: colors.text }}
        />
        <Input
          placeholder="Password"
          placeholderTextColor={colors.placeholder}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={fieldErrors.password}
          style={{ borderColor: '#cb6ce6', color: colors.text }}
        />
        <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
          <Text style={[styles.link, { color: colors.text }]}>Forgot password?</Text>
        </TouchableOpacity>
        <Button
          label="Login"
          onPress={handleSubmit}
          disabled={isLoading}
          style={Platform.OS === 'web' ? ({
            background: 'linear-gradient(to right, #004aad, #cb6ce6)',
          } as any) : { backgroundColor: '#004aad' }}
        />
        <View style={[styles.footer, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.footerText, { color: colors.text, fontFamily: font.regular }]}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={[styles.link, { color: colors.text, fontFamily: font.medium }]}>Register</Text>
          </TouchableOpacity>
        </View>

        <GoogleSignInButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16, justifyContent: 'center', paddingHorizontal: 40, marginTop: -100 },
  titleWrap: { alignItems: 'center', width: '100%' },
  glowLayer: { position: 'absolute', top: 0, left: 0, right: 0 },
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
  appLogo: { width: 1040, height: 520 },
  title: { fontSize: 28, fontWeight: '900', color: '#004aad', marginBottom: 8, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '500', textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { fontSize: 14 },
});
