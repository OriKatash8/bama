import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { useRegister } from '@features/auth/hooks/useRegister';
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
      <View style={[styles.titleWrap, { marginBottom: 64 }]}>
        {Platform.OS === 'web' && (
          <View style={styles.glowLayer as any}>
            <Text style={[styles.appName, { fontSize: appNameSize, color: '#9b6ff5' }, ({ filter: 'blur(8px)', opacity: 0.55 } as any)]}>BAMA</Text>
          </View>
        )}
        <Text style={[styles.appName, { fontSize: appNameSize }, Platform.OS === 'web' && gradientStyle]}>BAMA</Text>
      </View>
      <View style={[styles.card, Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as any)]}>
        <View style={styles.titleWrap}>
          {Platform.OS === 'web' && (
            <View style={styles.glowLayer as any}>
              <Text style={[styles.title, { color: '#9b6ff5' } as any, ({ filter: 'blur(7px)', opacity: 0.55 } as any)]}>Register</Text>
            </View>
          )}
          <Text style={[styles.title, Platform.OS === 'web' && gradientStyle]}>Register</Text>
        </View>
        <Input
          label="Full Name"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          error={fieldErrors.fullName}
          labelStyle={styles.inputLabel}
          style={styles.inputField}
        />
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={fieldErrors.email}
          labelStyle={styles.inputLabel}
          style={styles.inputField}
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={fieldErrors.password}
          labelStyle={styles.inputLabel}
          style={styles.inputField}
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
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/')}>
            <Text style={styles.link}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16, justifyContent: 'center' },
  titleWrap: { alignItems: 'center', width: '100%' },
  glowLayer: { position: 'absolute', top: 0, left: 0, right: 0 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: '#ffffff18',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  appName: { fontSize: 192, fontWeight: '900', color: '#004aad', textAlign: 'center' },
  title: { fontSize: 72, fontWeight: '900', color: '#004aad', marginBottom: 8, textAlign: 'center' },
  link: { fontSize: 14, color: '#fff', fontWeight: '500', textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { fontSize: 14, color: '#fff' },
  inputLabel: { color: '#fff' },
  inputField: { borderColor: '#ffffff44', color: '#fff' },
});
