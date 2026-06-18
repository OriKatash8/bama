import { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { useRegister } from '@features/auth/hooks/useRegister';
import { useTheme } from '@core/hooks/useTheme';
import { isValidEmail, isNonEmpty } from '@utils/validators';

const gradientStyle = {
  background: 'linear-gradient(to right, #004aad, #cb6ce6)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as any;

export function RegisterForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
  }>({});
  const { isLoading, register } = useRegister();
  const router = useRouter();
  const colors = useTheme();
  const appNameSize = 130;

  function validate(): boolean {
    const errors: { fullName?: string; email?: string; password?: string } = {};
    if (!isNonEmpty(fullName)) errors.fullName = 'Full name is required.';
    if (!isValidEmail(email)) errors.email = 'Enter a valid email.';
    if (password.length < 6) errors.password = 'Password must be at least 6 characters.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    await register(fullName, email, password);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.titleWrap, { marginBottom: -60 }]}>
        <Image source={require('../../../../assets/images/bama-logo.png')} style={styles.appLogo} resizeMode="contain" />
      </View>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as any)]}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>REGISTER</Text>
        </View>
        <Input
          placeholder="Full Name"
          placeholderTextColor={colors.placeholder}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          error={fieldErrors.fullName}
          style={{ borderColor: '#cb6ce6', color: colors.text }}
        />
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
        <Button
          label="Create Account"
          onPress={handleSubmit}
          disabled={isLoading}
          style={Platform.OS === 'web' ? ({
            background: 'linear-gradient(to right, #004aad, #cb6ce6)',
          } as any) : { backgroundColor: '#004aad' }}
        />
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.text }]}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/')}>
            <Text style={[styles.link, { color: colors.text }]}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16, justifyContent: 'center', paddingHorizontal: 40 },
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
